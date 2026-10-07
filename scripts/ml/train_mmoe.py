#!/usr/bin/env python3
"""
Multi-gate Mixture-of-Experts (MMoE) Training Script

Trains an MMoE model for multi-objective content ranking with three tasks:
  - Engagement: predicts user engagement probability (clicks, likes, shares)
  - Retention: predicts long-term user retention impact
  - Wellbeing: predicts positive wellbeing impact (demotes harmful content)

The architecture uses shared expert networks with per-task gating to allow
each task to learn different mixtures of the shared representations.

Usage:
    python train_mmoe.py --data-path data/ranking.csv --output-dir models/mmoe
"""

import argparse
import os
import sys
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset

try:
    import onnx
    import onnxruntime as ort
except ImportError:
    onnx = None
    ort = None


# --------------------------------------------------------------------------
# Model Architecture
# --------------------------------------------------------------------------


class ExpertNetwork(nn.Module):
    """Shared expert network that learns a specific representation."""

    def __init__(self, input_dim: int, hidden_dim: int, output_dim: int):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, output_dim),
            nn.ReLU(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x)


class GatingNetwork(nn.Module):
    """Per-task gating network that learns how to mix expert outputs."""

    def __init__(self, input_dim: int, num_experts: int):
        super().__init__()
        self.gate = nn.Sequential(
            nn.Linear(input_dim, num_experts),
            nn.Softmax(dim=-1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.gate(x)


class TaskTower(nn.Module):
    """Task-specific tower that produces the final prediction for one objective."""

    def __init__(self, input_dim: int, hidden_dim: int):
        super().__init__()
        self.tower = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.tower(x).squeeze(-1)


class MMoEModel(nn.Module):
    """
    Multi-gate Mixture-of-Experts model for multi-objective ranking.

    Architecture:
      Input -> [Expert1, Expert2, ..., ExpertN] (shared)
             -> GatingNetwork per task (selects expert mixture)
             -> TaskTower per task (final prediction)

    Tasks:
      - engagement: P(user engages with content)
      - retention: P(content improves long-term retention)
      - wellbeing: P(content is positive for user wellbeing)
    """

    def __init__(
        self,
        input_dim: int,
        num_experts: int = 6,
        expert_hidden_dim: int = 128,
        expert_output_dim: int = 64,
        tower_hidden_dim: int = 64,
        task_names: List[str] = None,
    ):
        super().__init__()
        if task_names is None:
            task_names = ["engagement", "retention", "wellbeing"]

        self.task_names = task_names
        self.num_experts = num_experts
        self.input_dim = input_dim

        # Shared experts
        self.experts = nn.ModuleList(
            [
                ExpertNetwork(input_dim, expert_hidden_dim, expert_output_dim)
                for _ in range(num_experts)
            ]
        )

        # Per-task gating networks
        self.gates = nn.ModuleDict(
            {name: GatingNetwork(input_dim, num_experts) for name in task_names}
        )

        # Per-task towers
        self.towers = nn.ModuleDict(
            {name: TaskTower(expert_output_dim, tower_hidden_dim) for name in task_names}
        )

    def forward(self, x: torch.Tensor) -> Dict[str, torch.Tensor]:
        # Compute expert outputs
        expert_outputs = [expert(x) for expert in self.experts]
        expert_outputs = torch.stack(expert_outputs, dim=1)  # (batch, num_experts, expert_dim)

        # Compute per-task predictions
        task_outputs = {}
        for task_name in self.task_names:
            # Get gating weights for this task
            gate_weights = self.gates[task_name](x)  # (batch, num_experts)
            gate_weights = gate_weights.unsqueeze(-1)  # (batch, num_experts, 1)

            # Weighted sum of expert outputs
            mixed = (expert_outputs * gate_weights).sum(dim=1)  # (batch, expert_dim)

            # Task-specific tower
            task_outputs[task_name] = self.towers[task_name](mixed)

        return task_outputs


# --------------------------------------------------------------------------
# Uncertainty Weighting for Multi-Task Loss
# --------------------------------------------------------------------------


class UncertaintyWeighting(nn.Module):
    """
    Learned uncertainty weighting for multi-task loss balancing.

    Based on "Multi-Task Learning Using Uncertainty to Weigh Losses"
    (Kendall et al., 2018). Each task has a learnable log-variance parameter
    that automatically balances the contribution of each loss.
    """

    def __init__(self, num_tasks: int):
        super().__init__()
        # Initialize log(sigma^2) to 0 (equal weighting)
        self.log_vars = nn.Parameter(torch.zeros(num_tasks))

    def forward(self, losses: List[torch.Tensor]) -> torch.Tensor:
        total_loss = torch.tensor(0.0, device=losses[0].device)
        for i, loss in enumerate(losses):
            # Loss_i / (2 * sigma_i^2) + log(sigma_i)
            precision = torch.exp(-self.log_vars[i])
            total_loss += precision * loss + self.log_vars[i]
        return total_loss


# --------------------------------------------------------------------------
# Dataset
# --------------------------------------------------------------------------


class RankingDataset(Dataset):
    """
    Dataset for multi-objective ranking.

    Expects a CSV with columns:
      - feature_0 through feature_N: numeric input features
      - engagement_label (float 0-1): engagement target
      - retention_label (float 0-1): retention target
      - wellbeing_label (float 0-1): wellbeing target
    """

    def __init__(self, csv_path: str, num_features: int = 32):
        self.df = pd.read_csv(csv_path)
        self.num_features = num_features

        # Identify feature columns
        feature_cols = [c for c in self.df.columns if c.startswith("feature_")]
        if len(feature_cols) == 0:
            # Fall back to first N numeric columns that are not labels
            label_cols = {"engagement_label", "retention_label", "wellbeing_label"}
            feature_cols = [c for c in self.df.columns if c not in label_cols][:num_features]

        self.feature_cols = feature_cols
        self.num_features = len(feature_cols)

        # Validate label columns exist
        required_labels = ["engagement_label", "retention_label", "wellbeing_label"]
        missing = [c for c in required_labels if c not in self.df.columns]
        if missing:
            raise ValueError(f"Missing label columns: {missing}")

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int) -> dict:
        row = self.df.iloc[idx]
        features = torch.tensor(
            row[self.feature_cols].values.astype(np.float32), dtype=torch.float32
        )
        return {
            "features": features,
            "engagement_label": torch.tensor(float(row["engagement_label"]), dtype=torch.float32),
            "retention_label": torch.tensor(float(row["retention_label"]), dtype=torch.float32),
            "wellbeing_label": torch.tensor(float(row["wellbeing_label"]), dtype=torch.float32),
        }


# --------------------------------------------------------------------------
# Training Loop
# --------------------------------------------------------------------------


def compute_task_metrics(
    model: MMoEModel, dataloader: DataLoader
) -> Dict[str, Dict[str, float]]:
    """Compute per-task AUC and accuracy metrics."""
    model.eval()
    task_preds = {name: [] for name in model.task_names}
    task_labels = {name: [] for name in model.task_names}

    with torch.no_grad():
        for batch in dataloader:
            outputs = model(batch["features"])
            for task_name in model.task_names:
                task_preds[task_name].extend(outputs[task_name].cpu().numpy().tolist())
                task_labels[task_name].extend(
                    batch[f"{task_name}_label"].cpu().numpy().tolist()
                )

    metrics = {}
    for task_name in model.task_names:
        preds = np.array(task_preds[task_name])
        labels = np.array(task_labels[task_name])
        binary_preds = (preds > 0.5).astype(float)
        accuracy = np.mean(binary_preds == (labels > 0.5).astype(float))
        # Mean absolute error
        mae = np.mean(np.abs(preds - labels))
        metrics[task_name] = {"accuracy": float(accuracy), "mae": float(mae)}

    return metrics


def train(
    model: MMoEModel,
    train_loader: DataLoader,
    val_loader: DataLoader,
    epochs: int,
    lr: float,
    output_dir: str,
    use_uncertainty_weighting: bool = True,
) -> None:
    """Train the MMoE model with multi-task loss."""
    os.makedirs(output_dir, exist_ok=True)

    # Loss and optimizer
    criterion = nn.BCELoss()
    num_tasks = len(model.task_names)

    if use_uncertainty_weighting:
        uncertainty = UncertaintyWeighting(num_tasks)
        optimizer = optim.Adam(
            list(model.parameters()) + list(uncertainty.parameters()),
            lr=lr,
            weight_decay=1e-5,
        )
    else:
        uncertainty = None
        task_weights = {name: 1.0 / num_tasks for name in model.task_names}
        optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)

    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=5
    )

    best_val_loss = float("inf")

    print(f"Training MMoE model for {epochs} epochs")
    print(f"  Tasks: {model.task_names}")
    print(f"  Experts: {model.num_experts}")
    print(f"  Input dim: {model.input_dim}")
    print(f"  Loss balancing: {'uncertainty weighting' if use_uncertainty_weighting else 'fixed weights'}")
    print(f"  Output dir: {output_dir}")
    print("-" * 60)

    for epoch in range(epochs):
        model.train()
        if uncertainty is not None:
            uncertainty.train()

        total_loss = 0.0
        task_losses = {name: 0.0 for name in model.task_names}
        num_batches = 0

        for batch in train_loader:
            optimizer.zero_grad()

            outputs = model(batch["features"])

            # Compute per-task losses
            losses = []
            for task_name in model.task_names:
                task_loss = criterion(outputs[task_name], batch[f"{task_name}_label"])
                losses.append(task_loss)
                task_losses[task_name] += task_loss.item()

            # Combine losses
            if uncertainty is not None:
                combined_loss = uncertainty(losses)
            else:
                combined_loss = sum(
                    w * l for w, l in zip(task_weights.values(), losses)
                )

            combined_loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            total_loss += combined_loss.item()
            num_batches += 1

        avg_loss = total_loss / max(num_batches, 1)
        avg_task_losses = {
            name: task_losses[name] / max(num_batches, 1) for name in model.task_names
        }

        # Validation
        model.eval()
        val_loss = 0.0
        val_batches = 0
        with torch.no_grad():
            for batch in val_loader:
                outputs = model(batch["features"])
                batch_loss = sum(
                    criterion(outputs[name], batch[f"{name}_label"])
                    for name in model.task_names
                )
                val_loss += batch_loss.item()
                val_batches += 1

        avg_val_loss = val_loss / max(val_batches, 1)
        scheduler.step(avg_val_loss)

        # Compute metrics
        metrics = compute_task_metrics(model, val_loader)

        # Print progress
        task_str = " | ".join(
            f"{name}: loss={avg_task_losses[name]:.4f} acc={metrics[name]['accuracy']:.3f}"
            for name in model.task_names
        )
        print(
            f"Epoch {epoch + 1}/{epochs} | "
            f"Train: {avg_loss:.4f} | Val: {avg_val_loss:.4f} | {task_str}"
        )

        if use_uncertainty_weighting and uncertainty is not None:
            weights_str = " ".join(
                f"{name}={torch.exp(-uncertainty.log_vars[i]).item():.3f}"
                for i, name in enumerate(model.task_names)
            )
            print(f"  Task weights: {weights_str}")

        # Save best model
        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            checkpoint_path = os.path.join(output_dir, "best_model.pt")
            save_dict = {
                "epoch": epoch + 1,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "val_loss": avg_val_loss,
                "metrics": metrics,
                "config": {
                    "input_dim": model.input_dim,
                    "num_experts": model.num_experts,
                    "task_names": model.task_names,
                },
            }
            if uncertainty is not None:
                save_dict["uncertainty_state_dict"] = uncertainty.state_dict()
            torch.save(save_dict, checkpoint_path)
            print(f"  -> Saved best model (val_loss={avg_val_loss:.4f})")

    # Save final model
    final_path = os.path.join(output_dir, "final_model.pt")
    torch.save(
        {
            "epoch": epochs,
            "model_state_dict": model.state_dict(),
            "config": {
                "input_dim": model.input_dim,
                "num_experts": model.num_experts,
                "task_names": model.task_names,
            },
        },
        final_path,
    )
    print(f"\nTraining complete. Best val loss: {best_val_loss:.4f}")
    print(f"Final model saved to: {final_path}")


# --------------------------------------------------------------------------
# ONNX Export
# --------------------------------------------------------------------------


def export_to_onnx(model: MMoEModel, output_dir: str, input_dim: int) -> None:
    """Export the MMoE model to ONNX format."""
    model.eval()
    os.makedirs(output_dir, exist_ok=True)

    onnx_path = os.path.join(output_dir, "mmoe_model.onnx")
    dummy_input = torch.randn(1, input_dim)

    # Create a wrapper that returns a tuple for ONNX export
    class MMoEExportWrapper(nn.Module):
        def __init__(self, mmoe: MMoEModel):
            super().__init__()
            self.mmoe = mmoe

        def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, ...]:
            outputs = self.mmoe(x)
            return tuple(outputs[name] for name in self.mmoe.task_names)

    wrapper = MMoEExportWrapper(model)
    wrapper.eval()

    output_names = [f"{name}_score" for name in model.task_names]

    torch.onnx.export(
        wrapper,
        dummy_input,
        onnx_path,
        input_names=["features"],
        output_names=output_names,
        dynamic_axes={
            "features": {0: "batch_size"},
            **{name: {0: "batch_size"} for name in output_names},
        },
        opset_version=17,
        do_constant_folding=True,
    )
    print(f"MMoE model exported to: {onnx_path}")

    # Validate
    if onnx is not None:
        onnx_model = onnx.load(onnx_path)
        onnx.checker.check_model(onnx_model)
        print("  ONNX validation: PASSED")

    # Test inference
    if ort is not None:
        session = ort.InferenceSession(onnx_path)
        inputs = {"features": np.random.randn(1, input_dim).astype(np.float32)}
        outputs = session.run(None, inputs)
        for i, name in enumerate(model.task_names):
            print(f"  {name} output shape: {outputs[i].shape}")


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train an MMoE multi-objective ranking model"
    )
    parser.add_argument(
        "--epochs", type=int, default=100, help="Number of training epochs (default: 100)"
    )
    parser.add_argument(
        "--batch-size", type=int, default=512, help="Training batch size (default: 512)"
    )
    parser.add_argument(
        "--lr", type=float, default=1e-3, help="Learning rate (default: 1e-3)"
    )
    parser.add_argument(
        "--num-experts", type=int, default=6, help="Number of shared experts (default: 6)"
    )
    parser.add_argument(
        "--data-path",
        type=str,
        required=True,
        help="Path to CSV file with ranking data",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="models/mmoe",
        help="Directory to save model artifacts (default: models/mmoe)",
    )
    parser.add_argument(
        "--no-uncertainty-weighting",
        action="store_true",
        help="Use fixed task weights instead of learned uncertainty weighting",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    print("=" * 60)
    print("MMoE Multi-Objective Ranking Model Training")
    print("=" * 60)

    # Load data
    print(f"\nLoading data from: {args.data_path}")
    if not os.path.exists(args.data_path):
        print(f"ERROR: Data file not found: {args.data_path}")
        sys.exit(1)

    dataset = RankingDataset(args.data_path)
    print(f"  Samples: {len(dataset)}")
    print(f"  Features: {dataset.num_features}")

    # Train/val split (80/20)
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_dataset, val_dataset = torch.utils.data.random_split(dataset, [train_size, val_size])

    train_loader = DataLoader(
        train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=0
    )
    val_loader = DataLoader(
        val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=0
    )

    # Create model
    model = MMoEModel(
        input_dim=dataset.num_features,
        num_experts=args.num_experts,
        expert_hidden_dim=128,
        expert_output_dim=64,
        tower_hidden_dim=64,
        task_names=["engagement", "retention", "wellbeing"],
    )

    total_params = sum(p.numel() for p in model.parameters())
    print(f"  Model parameters: {total_params:,}")

    # Train
    train(
        model,
        train_loader,
        val_loader,
        args.epochs,
        args.lr,
        args.output_dir,
        use_uncertainty_weighting=not args.no_uncertainty_weighting,
    )

    # Export to ONNX
    print("\n" + "=" * 60)
    print("Exporting to ONNX")
    print("=" * 60)
    export_to_onnx(model, args.output_dir, dataset.num_features)

    print("\nDone!")


if __name__ == "__main__":
    main()

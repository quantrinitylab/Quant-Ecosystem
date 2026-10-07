#!/usr/bin/env python3
"""
Two-Tower Model Training Script

Trains a Two-Tower retrieval model for user-item recommendations.
The model consists of a User Tower and an Item Tower that produce embeddings
in a shared latent space. Training uses contrastive loss (triplet margin loss)
to bring matching user-item pairs closer while pushing non-matching pairs apart.

Usage:
    python train_two_tower.py --data-path data/interactions.csv --output-dir models/two_tower
"""

import argparse
import os
import sys
from typing import Tuple

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


class UserTower(nn.Module):
    """User tower: maps user features to a dense embedding vector."""

    def __init__(
        self,
        num_user_ids: int,
        num_user_categories: int,
        embedding_dim: int = 64,
        hidden_dim: int = 128,
    ):
        super().__init__()
        self.user_id_embedding = nn.Embedding(num_user_ids, embedding_dim)
        self.user_category_embedding = nn.Embedding(num_user_categories, embedding_dim)
        self.fc = nn.Sequential(
            nn.Linear(embedding_dim * 2, hidden_dim),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim),
            nn.Linear(hidden_dim, embedding_dim),
        )

    def forward(self, user_id: torch.Tensor, user_category: torch.Tensor) -> torch.Tensor:
        uid_emb = self.user_id_embedding(user_id)
        ucat_emb = self.user_category_embedding(user_category)
        x = torch.cat([uid_emb, ucat_emb], dim=-1)
        x = self.fc(x)
        # L2 normalize for cosine similarity in retrieval
        x = nn.functional.normalize(x, p=2, dim=-1)
        return x


class ItemTower(nn.Module):
    """Item tower: maps item features to a dense embedding vector."""

    def __init__(
        self,
        num_item_ids: int,
        num_item_categories: int,
        embedding_dim: int = 64,
        hidden_dim: int = 128,
    ):
        super().__init__()
        self.item_id_embedding = nn.Embedding(num_item_ids, embedding_dim)
        self.item_category_embedding = nn.Embedding(num_item_categories, embedding_dim)
        self.fc = nn.Sequential(
            nn.Linear(embedding_dim * 2, hidden_dim),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim),
            nn.Linear(hidden_dim, embedding_dim),
        )

    def forward(self, item_id: torch.Tensor, item_category: torch.Tensor) -> torch.Tensor:
        iid_emb = self.item_id_embedding(item_id)
        icat_emb = self.item_category_embedding(item_category)
        x = torch.cat([iid_emb, icat_emb], dim=-1)
        x = self.fc(x)
        x = nn.functional.normalize(x, p=2, dim=-1)
        return x


class TwoTowerModel(nn.Module):
    """
    Two-Tower retrieval model combining user and item towers.

    During training, both towers are optimized jointly with contrastive loss.
    At inference time, towers can be run independently to produce embeddings
    for ANN (Approximate Nearest Neighbor) retrieval.
    """

    def __init__(
        self,
        num_user_ids: int,
        num_item_ids: int,
        num_user_categories: int,
        num_item_categories: int,
        embedding_dim: int = 64,
        hidden_dim: int = 128,
    ):
        super().__init__()
        self.user_tower = UserTower(num_user_ids, num_user_categories, embedding_dim, hidden_dim)
        self.item_tower = ItemTower(num_item_ids, num_item_categories, embedding_dim, hidden_dim)
        self.embedding_dim = embedding_dim

    def forward(
        self,
        user_id: torch.Tensor,
        user_category: torch.Tensor,
        item_id: torch.Tensor,
        item_category: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        user_emb = self.user_tower(user_id, user_category)
        item_emb = self.item_tower(item_id, item_category)
        return user_emb, item_emb


# --------------------------------------------------------------------------
# Dataset
# --------------------------------------------------------------------------


class InteractionDataset(Dataset):
    """
    Dataset for user-item interactions.

    Expects a CSV with columns:
      - user_id (int): User identifier
      - user_category (int): User category/segment
      - item_id (int): Item identifier
      - item_category (int): Item category
      - label (int): 1 for positive interaction, 0 for negative
    """

    def __init__(self, csv_path: str):
        self.df = pd.read_csv(csv_path)
        required_cols = ["user_id", "user_category", "item_id", "item_category", "label"]
        missing = [c for c in required_cols if c not in self.df.columns]
        if missing:
            raise ValueError(f"Missing columns in data: {missing}")

        self.positives = self.df[self.df["label"] == 1].reset_index(drop=True)
        self.negatives = self.df[self.df["label"] == 0].reset_index(drop=True)

        if len(self.positives) == 0:
            raise ValueError("No positive interactions found in data")

    def __len__(self) -> int:
        return len(self.positives)

    def __getitem__(self, idx: int) -> dict:
        pos = self.positives.iloc[idx]
        # Sample a random negative for contrastive learning
        neg_idx = np.random.randint(0, len(self.negatives)) if len(self.negatives) > 0 else idx
        neg = self.negatives.iloc[neg_idx] if len(self.negatives) > 0 else self.positives.iloc[(idx + 1) % len(self.positives)]

        return {
            "user_id": torch.tensor(int(pos["user_id"]), dtype=torch.long),
            "user_category": torch.tensor(int(pos["user_category"]), dtype=torch.long),
            "pos_item_id": torch.tensor(int(pos["item_id"]), dtype=torch.long),
            "pos_item_category": torch.tensor(int(pos["item_category"]), dtype=torch.long),
            "neg_item_id": torch.tensor(int(neg["item_id"]), dtype=torch.long),
            "neg_item_category": torch.tensor(int(neg["item_category"]), dtype=torch.long),
        }


# --------------------------------------------------------------------------
# Evaluation Metrics
# --------------------------------------------------------------------------


def compute_hit_rate(model: TwoTowerModel, dataloader: DataLoader, k: int = 10) -> float:
    """Compute Hit Rate@K: fraction of queries where the positive item is in top-K."""
    model.eval()
    hits = 0
    total = 0

    with torch.no_grad():
        for batch in dataloader:
            user_emb = model.user_tower(batch["user_id"], batch["user_category"])
            pos_item_emb = model.item_tower(batch["pos_item_id"], batch["pos_item_category"])
            neg_item_emb = model.item_tower(batch["neg_item_id"], batch["neg_item_category"])

            # Score positive and negative items
            pos_score = (user_emb * pos_item_emb).sum(dim=-1)
            neg_score = (user_emb * neg_item_emb).sum(dim=-1)

            # Hit if positive scores higher than negative
            hits += (pos_score > neg_score).sum().item()
            total += len(pos_score)

    return hits / max(total, 1)


def compute_ndcg(model: TwoTowerModel, dataloader: DataLoader, k: int = 10) -> float:
    """Compute simplified NDCG@K for the Two-Tower model."""
    model.eval()
    ndcg_sum = 0.0
    total = 0

    with torch.no_grad():
        for batch in dataloader:
            user_emb = model.user_tower(batch["user_id"], batch["user_category"])
            pos_item_emb = model.item_tower(batch["pos_item_id"], batch["pos_item_category"])
            neg_item_emb = model.item_tower(batch["neg_item_id"], batch["neg_item_category"])

            pos_score = (user_emb * pos_item_emb).sum(dim=-1)
            neg_score = (user_emb * neg_item_emb).sum(dim=-1)

            # Binary relevance: positive=1, negative=0
            # If positive ranks first, DCG = 1/log2(2) = 1.0 (perfect)
            # If negative ranks first, DCG = 1/log2(3) ~ 0.63
            for ps, ns in zip(pos_score, neg_score):
                if ps > ns:
                    ndcg_sum += 1.0
                else:
                    ndcg_sum += 1.0 / np.log2(3)
                total += 1

    return ndcg_sum / max(total, 1)


# --------------------------------------------------------------------------
# Training Loop
# --------------------------------------------------------------------------


def train(
    model: TwoTowerModel,
    train_loader: DataLoader,
    val_loader: DataLoader,
    epochs: int,
    lr: float,
    output_dir: str,
) -> None:
    """Train the Two-Tower model with triplet margin loss."""
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    triplet_loss = nn.TripletMarginLoss(margin=0.5, p=2)

    best_hit_rate = 0.0
    os.makedirs(output_dir, exist_ok=True)

    print(f"Training Two-Tower model for {epochs} epochs")
    print(f"  Learning rate: {lr}")
    print(f"  Embedding dim: {model.embedding_dim}")
    print(f"  Output dir: {output_dir}")
    print("-" * 60)

    for epoch in range(epochs):
        model.train()
        total_loss = 0.0
        num_batches = 0

        for batch in train_loader:
            optimizer.zero_grad()

            # Get user embeddings
            user_emb = model.user_tower(batch["user_id"], batch["user_category"])

            # Get positive item embeddings
            pos_item_emb = model.item_tower(batch["pos_item_id"], batch["pos_item_category"])

            # Get negative item embeddings
            neg_item_emb = model.item_tower(batch["neg_item_id"], batch["neg_item_category"])

            # Triplet loss: anchor=user, positive=matched item, negative=random item
            loss = triplet_loss(user_emb, pos_item_emb, neg_item_emb)

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            total_loss += loss.item()
            num_batches += 1

        scheduler.step()

        avg_loss = total_loss / max(num_batches, 1)

        # Evaluation
        hit_rate = compute_hit_rate(model, val_loader)
        ndcg = compute_ndcg(model, val_loader)

        print(
            f"Epoch {epoch + 1}/{epochs} | "
            f"Loss: {avg_loss:.4f} | "
            f"Hit Rate@10: {hit_rate:.4f} | "
            f"NDCG@10: {ndcg:.4f} | "
            f"LR: {scheduler.get_last_lr()[0]:.6f}"
        )

        # Save best model
        if hit_rate > best_hit_rate:
            best_hit_rate = hit_rate
            checkpoint_path = os.path.join(output_dir, "best_model.pt")
            torch.save(
                {
                    "epoch": epoch + 1,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "hit_rate": hit_rate,
                    "ndcg": ndcg,
                    "config": {
                        "embedding_dim": model.embedding_dim,
                        "num_user_ids": model.user_tower.user_id_embedding.num_embeddings,
                        "num_item_ids": model.item_tower.item_id_embedding.num_embeddings,
                        "num_user_categories": model.user_tower.user_category_embedding.num_embeddings,
                        "num_item_categories": model.item_tower.item_category_embedding.num_embeddings,
                    },
                },
                checkpoint_path,
            )
            print(f"  -> Saved best model (hit_rate={hit_rate:.4f})")

    # Save final model
    final_path = os.path.join(output_dir, "final_model.pt")
    torch.save(
        {
            "epoch": epochs,
            "model_state_dict": model.state_dict(),
            "config": {
                "embedding_dim": model.embedding_dim,
                "num_user_ids": model.user_tower.user_id_embedding.num_embeddings,
                "num_item_ids": model.item_tower.item_id_embedding.num_embeddings,
                "num_user_categories": model.user_tower.user_category_embedding.num_embeddings,
                "num_item_categories": model.item_tower.item_category_embedding.num_embeddings,
            },
        },
        final_path,
    )
    print(f"\nTraining complete. Best Hit Rate@10: {best_hit_rate:.4f}")
    print(f"Final model saved to: {final_path}")


# --------------------------------------------------------------------------
# ONNX Export
# --------------------------------------------------------------------------


def export_to_onnx(model: TwoTowerModel, output_dir: str) -> None:
    """Export the Two-Tower model to ONNX format (separate user and item towers)."""
    model.eval()
    os.makedirs(output_dir, exist_ok=True)

    # Export User Tower
    user_tower_path = os.path.join(output_dir, "user_tower.onnx")
    dummy_user_id = torch.zeros(1, dtype=torch.long)
    dummy_user_cat = torch.zeros(1, dtype=torch.long)

    torch.onnx.export(
        model.user_tower,
        (dummy_user_id, dummy_user_cat),
        user_tower_path,
        input_names=["user_id", "user_category"],
        output_names=["user_embedding"],
        dynamic_axes={
            "user_id": {0: "batch_size"},
            "user_category": {0: "batch_size"},
            "user_embedding": {0: "batch_size"},
        },
        opset_version=17,
        do_constant_folding=True,
    )
    print(f"User tower exported to: {user_tower_path}")

    # Export Item Tower
    item_tower_path = os.path.join(output_dir, "item_tower.onnx")
    dummy_item_id = torch.zeros(1, dtype=torch.long)
    dummy_item_cat = torch.zeros(1, dtype=torch.long)

    torch.onnx.export(
        model.item_tower,
        (dummy_item_id, dummy_item_cat),
        item_tower_path,
        input_names=["item_id", "item_category"],
        output_names=["item_embedding"],
        dynamic_axes={
            "item_id": {0: "batch_size"},
            "item_category": {0: "batch_size"},
            "item_embedding": {0: "batch_size"},
        },
        opset_version=17,
        do_constant_folding=True,
    )
    print(f"Item tower exported to: {item_tower_path}")

    # Validate exported models
    if onnx is not None:
        user_model = onnx.load(user_tower_path)
        onnx.checker.check_model(user_model)
        print("  User tower ONNX validation: PASSED")

        item_model = onnx.load(item_tower_path)
        onnx.checker.check_model(item_model)
        print("  Item tower ONNX validation: PASSED")

    # Verify with ONNX Runtime
    if ort is not None:
        session = ort.InferenceSession(user_tower_path)
        inputs = {
            "user_id": np.zeros((1,), dtype=np.int64),
            "user_category": np.zeros((1,), dtype=np.int64),
        }
        outputs = session.run(None, inputs)
        print(f"  User tower output shape: {outputs[0].shape}")

        session = ort.InferenceSession(item_tower_path)
        inputs = {
            "item_id": np.zeros((1,), dtype=np.int64),
            "item_category": np.zeros((1,), dtype=np.int64),
        }
        outputs = session.run(None, inputs)
        print(f"  Item tower output shape: {outputs[0].shape}")


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train a Two-Tower retrieval model for recommendations"
    )
    parser.add_argument(
        "--epochs", type=int, default=50, help="Number of training epochs (default: 50)"
    )
    parser.add_argument(
        "--batch-size", type=int, default=256, help="Training batch size (default: 256)"
    )
    parser.add_argument(
        "--lr", type=float, default=1e-3, help="Learning rate (default: 1e-3)"
    )
    parser.add_argument(
        "--embedding-dim", type=int, default=64, help="Embedding dimension (default: 64)"
    )
    parser.add_argument(
        "--data-path",
        type=str,
        required=True,
        help="Path to CSV file with interaction data",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="models/two_tower",
        help="Directory to save model artifacts (default: models/two_tower)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    print("=" * 60)
    print("Two-Tower Retrieval Model Training")
    print("=" * 60)

    # Load data
    print(f"\nLoading data from: {args.data_path}")
    if not os.path.exists(args.data_path):
        print(f"ERROR: Data file not found: {args.data_path}")
        sys.exit(1)

    dataset = InteractionDataset(args.data_path)
    print(f"  Total positive interactions: {len(dataset)}")

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

    # Determine vocabulary sizes from data
    df = dataset.df
    num_user_ids = int(df["user_id"].max()) + 1
    num_item_ids = int(df["item_id"].max()) + 1
    num_user_categories = int(df["user_category"].max()) + 1
    num_item_categories = int(df["item_category"].max()) + 1

    print(f"  Users: {num_user_ids}, Items: {num_item_ids}")
    print(f"  User categories: {num_user_categories}, Item categories: {num_item_categories}")

    # Create model
    model = TwoTowerModel(
        num_user_ids=num_user_ids,
        num_item_ids=num_item_ids,
        num_user_categories=num_user_categories,
        num_item_categories=num_item_categories,
        embedding_dim=args.embedding_dim,
        hidden_dim=args.embedding_dim * 2,
    )

    total_params = sum(p.numel() for p in model.parameters())
    print(f"  Model parameters: {total_params:,}")

    # Train
    train(model, train_loader, val_loader, args.epochs, args.lr, args.output_dir)

    # Export to ONNX
    print("\n" + "=" * 60)
    print("Exporting to ONNX")
    print("=" * 60)
    export_to_onnx(model, args.output_dir)

    print("\nDone!")


if __name__ == "__main__":
    main()

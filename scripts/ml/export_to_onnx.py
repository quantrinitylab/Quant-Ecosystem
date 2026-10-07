#!/usr/bin/env python3
"""
ONNX Export Utility

Generic utility for converting PyTorch model checkpoints to ONNX format.
Supports both Two-Tower and MMoE model architectures.

Usage:
    python export_to_onnx.py --model-path models/two_tower/best_model.pt \
                             --output-path models/two_tower/exported.onnx \
                             --model-type two_tower

    python export_to_onnx.py --model-path models/mmoe/best_model.pt \
                             --output-path models/mmoe/exported.onnx \
                             --model-type mmoe
"""

import argparse
import json
import os
import sys
from typing import Dict, Tuple

import numpy as np
import torch
import torch.nn as nn

try:
    import onnx
    from onnx import numpy_helper
except ImportError:
    onnx = None

try:
    import onnxruntime as ort
except ImportError:
    ort = None


# Import model definitions
# When used as part of this package, models are imported from sibling modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train_two_tower import TwoTowerModel, UserTower, ItemTower
from train_mmoe import MMoEModel


# --------------------------------------------------------------------------
# Model Loading
# --------------------------------------------------------------------------


def load_two_tower_model(checkpoint_path: str) -> TwoTowerModel:
    """Load a Two-Tower model from a PyTorch checkpoint."""
    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    config = checkpoint["config"]

    model = TwoTowerModel(
        num_user_ids=config["num_user_ids"],
        num_item_ids=config["num_item_ids"],
        num_user_categories=config["num_user_categories"],
        num_item_categories=config["num_item_categories"],
        embedding_dim=config["embedding_dim"],
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model


def load_mmoe_model(checkpoint_path: str) -> MMoEModel:
    """Load an MMoE model from a PyTorch checkpoint."""
    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    config = checkpoint["config"]

    model = MMoEModel(
        input_dim=config["input_dim"],
        num_experts=config["num_experts"],
        task_names=config.get("task_names", ["engagement", "retention", "wellbeing"]),
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model


# --------------------------------------------------------------------------
# Dummy Input Generation
# --------------------------------------------------------------------------


def create_dummy_input_two_tower(config: dict) -> Dict[str, torch.Tensor]:
    """Create dummy inputs for Two-Tower model tracing."""
    return {
        "user_id": torch.zeros(1, dtype=torch.long),
        "user_category": torch.zeros(1, dtype=torch.long),
        "item_id": torch.zeros(1, dtype=torch.long),
        "item_category": torch.zeros(1, dtype=torch.long),
    }


def create_dummy_input_mmoe(config: dict) -> Dict[str, torch.Tensor]:
    """Create dummy inputs for MMoE model tracing."""
    input_dim = config["input_dim"]
    return {
        "features": torch.randn(1, input_dim),
    }


# --------------------------------------------------------------------------
# ONNX Export
# --------------------------------------------------------------------------


def export_two_tower(
    model: TwoTowerModel, output_path: str, opset_version: int
) -> None:
    """Export Two-Tower model as separate user and item tower ONNX files."""
    output_dir = os.path.dirname(output_path)
    base_name = os.path.splitext(os.path.basename(output_path))[0]

    # Export User Tower
    user_path = os.path.join(output_dir, f"{base_name}_user_tower.onnx")
    dummy_user_id = torch.zeros(1, dtype=torch.long)
    dummy_user_cat = torch.zeros(1, dtype=torch.long)

    torch.onnx.export(
        model.user_tower,
        (dummy_user_id, dummy_user_cat),
        user_path,
        input_names=["user_id", "user_category"],
        output_names=["user_embedding"],
        dynamic_axes={
            "user_id": {0: "batch_size"},
            "user_category": {0: "batch_size"},
            "user_embedding": {0: "batch_size"},
        },
        opset_version=opset_version,
        do_constant_folding=True,
    )
    print(f"  User tower exported: {user_path}")

    # Export Item Tower
    item_path = os.path.join(output_dir, f"{base_name}_item_tower.onnx")
    dummy_item_id = torch.zeros(1, dtype=torch.long)
    dummy_item_cat = torch.zeros(1, dtype=torch.long)

    torch.onnx.export(
        model.item_tower,
        (dummy_item_id, dummy_item_cat),
        item_path,
        input_names=["item_id", "item_category"],
        output_names=["item_embedding"],
        dynamic_axes={
            "item_id": {0: "batch_size"},
            "item_category": {0: "batch_size"},
            "item_embedding": {0: "batch_size"},
        },
        opset_version=opset_version,
        do_constant_folding=True,
    )
    print(f"  Item tower exported: {item_path}")

    return user_path, item_path


def export_mmoe(model: MMoEModel, output_path: str, opset_version: int) -> None:
    """Export MMoE model to a single ONNX file."""

    class MMoEExportWrapper(nn.Module):
        def __init__(self, mmoe: MMoEModel):
            super().__init__()
            self.mmoe = mmoe

        def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, ...]:
            outputs = self.mmoe(x)
            return tuple(outputs[name] for name in self.mmoe.task_names)

    wrapper = MMoEExportWrapper(model)
    wrapper.eval()

    dummy_input = torch.randn(1, model.input_dim)
    output_names = [f"{name}_score" for name in model.task_names]

    torch.onnx.export(
        wrapper,
        dummy_input,
        output_path,
        input_names=["features"],
        output_names=output_names,
        dynamic_axes={
            "features": {0: "batch_size"},
            **{name: {0: "batch_size"} for name in output_names},
        },
        opset_version=opset_version,
        do_constant_folding=True,
    )
    print(f"  MMoE model exported: {output_path}")

    return output_path


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------


def validate_onnx_model(model_path: str) -> bool:
    """Validate an ONNX model using onnx.checker."""
    if onnx is None:
        print("  WARNING: onnx package not available, skipping validation")
        return True

    try:
        onnx_model = onnx.load(model_path)
        onnx.checker.check_model(onnx_model)
        print(f"  Validation PASSED: {model_path}")
        return True
    except Exception as e:
        print(f"  Validation FAILED: {model_path}")
        print(f"    Error: {e}")
        return False


def print_model_info(model_path: str) -> None:
    """Print detailed information about an ONNX model."""
    if onnx is None:
        print("  WARNING: onnx package not available, cannot print model info")
        return

    onnx_model = onnx.load(model_path)
    graph = onnx_model.graph

    print(f"\n  Model: {model_path}")
    print(f"  IR version: {onnx_model.ir_version}")
    print(f"  Opset version: {onnx_model.opset_import[0].version}")
    print(f"  Producer: {onnx_model.producer_name} {onnx_model.producer_version}")

    # Inputs
    print(f"\n  Inputs ({len(graph.input)}):")
    for inp in graph.input:
        shape = []
        for dim in inp.type.tensor_type.shape.dim:
            if dim.dim_param:
                shape.append(dim.dim_param)
            else:
                shape.append(str(dim.dim_value))
        elem_type = inp.type.tensor_type.elem_type
        type_names = {1: "float32", 7: "int64", 9: "bool", 11: "double"}
        type_name = type_names.get(elem_type, f"type_{elem_type}")
        print(f"    {inp.name}: [{', '.join(shape)}] ({type_name})")

    # Outputs
    print(f"\n  Outputs ({len(graph.output)}):")
    for out in graph.output:
        shape = []
        for dim in out.type.tensor_type.shape.dim:
            if dim.dim_param:
                shape.append(dim.dim_param)
            else:
                shape.append(str(dim.dim_value))
        elem_type = out.type.tensor_type.elem_type
        type_name = type_names.get(elem_type, f"type_{elem_type}")
        print(f"    {out.name}: [{', '.join(shape)}] ({type_name})")

    # Operations
    op_counts: Dict[str, int] = {}
    for node in graph.node:
        op_counts[node.op_type] = op_counts.get(node.op_type, 0) + 1

    print(f"\n  Operations ({len(graph.node)} total):")
    for op, count in sorted(op_counts.items(), key=lambda x: -x[1]):
        print(f"    {op}: {count}")

    # Model size
    model_size = os.path.getsize(model_path)
    if model_size > 1024 * 1024:
        size_str = f"{model_size / (1024 * 1024):.2f} MB"
    else:
        size_str = f"{model_size / 1024:.2f} KB"
    print(f"\n  File size: {size_str}")


def test_inference(model_path: str, model_type: str, config: dict) -> None:
    """Run a test inference with ONNX Runtime."""
    if ort is None:
        print("  WARNING: onnxruntime not available, skipping inference test")
        return

    session = ort.InferenceSession(model_path)

    # Create test inputs
    if model_type == "two_tower_user":
        inputs = {
            "user_id": np.zeros((1,), dtype=np.int64),
            "user_category": np.zeros((1,), dtype=np.int64),
        }
    elif model_type == "two_tower_item":
        inputs = {
            "item_id": np.zeros((1,), dtype=np.int64),
            "item_category": np.zeros((1,), dtype=np.int64),
        }
    elif model_type == "mmoe":
        input_dim = config.get("input_dim", 32)
        inputs = {"features": np.random.randn(1, input_dim).astype(np.float32)}
    else:
        print(f"  Unknown model type for inference test: {model_type}")
        return

    outputs = session.run(None, inputs)
    print(f"\n  Inference test ({model_path}):")
    for i, output in enumerate(outputs):
        print(f"    Output {i}: shape={output.shape}, dtype={output.dtype}")
        print(f"      Sample values: {output.flatten()[:5]}")


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export PyTorch models to ONNX format"
    )
    parser.add_argument(
        "--model-path",
        type=str,
        required=True,
        help="Path to PyTorch checkpoint (.pt file)",
    )
    parser.add_argument(
        "--output-path",
        type=str,
        required=True,
        help="Output path for ONNX model",
    )
    parser.add_argument(
        "--opset-version",
        type=int,
        default=17,
        help="ONNX opset version (default: 17)",
    )
    parser.add_argument(
        "--model-type",
        type=str,
        required=True,
        choices=["two_tower", "mmoe"],
        help="Model architecture type: two_tower or mmoe",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    print("=" * 60)
    print("ONNX Model Export Utility")
    print("=" * 60)

    # Validate input
    if not os.path.exists(args.model_path):
        print(f"ERROR: Model file not found: {args.model_path}")
        sys.exit(1)

    # Create output directory
    output_dir = os.path.dirname(args.output_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    # Load checkpoint to get config
    print(f"\nLoading checkpoint: {args.model_path}")
    checkpoint = torch.load(args.model_path, map_location="cpu")
    config = checkpoint.get("config", {})
    print(f"  Config: {json.dumps(config, indent=2)}")

    # Export based on model type
    print(f"\nExporting as {args.model_type} (opset={args.opset_version})...")

    if args.model_type == "two_tower":
        model = load_two_tower_model(args.model_path)
        user_path, item_path = export_two_tower(model, args.output_path, args.opset_version)

        # Validate both towers
        print("\nValidating exported models...")
        valid_user = validate_onnx_model(user_path)
        valid_item = validate_onnx_model(item_path)

        if valid_user and valid_item:
            # Print info and test
            print_model_info(user_path)
            print_model_info(item_path)
            test_inference(user_path, "two_tower_user", config)
            test_inference(item_path, "two_tower_item", config)

    elif args.model_type == "mmoe":
        model = load_mmoe_model(args.model_path)
        onnx_path = export_mmoe(model, args.output_path, args.opset_version)

        # Validate
        print("\nValidating exported model...")
        valid = validate_onnx_model(onnx_path)

        if valid:
            print_model_info(onnx_path)
            test_inference(onnx_path, "mmoe", config)

    print("\nExport complete!")


if __name__ == "__main__":
    main()

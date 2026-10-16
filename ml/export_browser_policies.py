"""Export deterministic SB3 MLP actors for the static browser viewer.

Run from repository root: .venv/Scripts/python.exe ml/export_browser_policies.py
No training, critics, optimizers, or checkpoint changes are involved.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import torch
from env import VacuumCleaningEnv
from sb3_contrib import TRPO
from stable_baselines3 import A2C, DQN, PPO, SAC
from torch import nn

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "frontend" / "public" / "policies"
CLASSES = {"dqn": DQN, "ppo": PPO, "trpo": TRPO, "a2c": A2C, "sac": SAC}


def export_layers(modules: list[nn.Module]) -> list[dict]:
    layers = []
    for module in modules:
        if isinstance(module, nn.Linear):
            layers.append({"type": "linear", "weight": module.weight.detach().cpu().tolist(),
                           "bias": module.bias.detach().cpu().tolist()})
        elif isinstance(module, nn.ReLU):
            layers.append({"type": "relu"})
        elif isinstance(module, nn.Tanh):
            layers.append({"type": "tanh"})
        else:
            raise TypeError(f"Unsupported module: {module}")
    return layers


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(20261016)
    observations = rng.uniform(-1, 1, (128, 14)).astype(np.float32)
    observations[:3] = np.array([np.zeros(14), np.ones(14), -np.ones(14)], dtype=np.float32)
    fixtures = {"observations": observations.tolist(), "algorithms": {}}
    env = VacuumCleaningEnv(config_name="config_2.yaml")
    fixtures["raw_cases"] = []
    for index in range(32):
        observation, _ = env.reset(seed=12345 + index)
        for _ in range(index % 10):
            observation, _, _, _, _ = env.step(int(rng.integers(7)))
        current = env._current_state
        grid = np.asarray(current.dirt).reshape(env.grid_rows, env.grid_cols).tolist()
        normalized = np.clip(2 * ((observation.astype(np.float32) - env.observation_space.low) /
                                 (env.observation_space.high - env.observation_space.low)) - 1, -1, 1)
        fixtures["raw_cases"].append({"state": {"grid": grid, "robot_pos": list(current.robot_pos),
                                              "dock": list(env.dock_pos), "obstacles": list(current.obstacles),
                                              "battery": current.battery, "battery_capacity": env.battery_capacity},
                                      "observation": normalized.tolist()})
    env.close()
    for name, cls in CLASSES.items():
        path = ROOT / "ml" / "models" / name / "seed_12345" / f"{name}_v2_policy.zip"
        model = cls.load(path, device="cpu")
        if name == "dqn":
            modules = list(model.policy.q_net.q_net.children())
        elif name == "sac":
            modules = [*model.actor.latent_pi.children(), model.actor.mu, nn.Tanh()]
            if not np.all(model.action_space.low == -1) or not np.all(model.action_space.high == 1):
                raise ValueError("Browser SAC adapter expects actions in [-1, 1].")
        else:
            modules = [*model.policy.mlp_extractor.policy_net.children(), model.policy.action_net]
        layers = export_layers(modules)
        network = nn.Sequential(*modules).eval()
        with torch.no_grad():
            output = network(torch.as_tensor(observations)).cpu().numpy()
        actions, _ = model.predict(observations, deterministic=True)
        if name == "sac":
            indices = np.rint((np.clip(actions[:, 0], -1, 1) + 1) * 3).astype(int)
            assert np.allclose(output, actions, atol=1e-6)
        else:
            indices = actions.astype(int)
            assert np.array_equal(np.argmax(output, axis=1), indices)
        payload = {"format": 1, "algorithm": name, "training_seed": 12345,
                   "checkpoint_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                   "observation_size": 14, "action_count": 7,
                   "actions": ["N", "S", "E", "W", "Stay", "Clean", "Charge"], "layers": layers}
        (OUTPUT / f"{name}.json").write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
        fixtures["algorithms"][name] = {"outputs": output.tolist(), "actions": indices.tolist()}
        print(f"Exported {name.upper()}: {len(layers)} layers, {path.name}")
    fixture_path = ROOT / "frontend" / "tests" / "fixtures" / "policyParity.json"
    fixture_path.parent.mkdir(parents=True, exist_ok=True)
    fixture_path.write_text(json.dumps(fixtures, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

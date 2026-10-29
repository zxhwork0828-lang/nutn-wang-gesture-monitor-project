"""Run after dependency installation in Render's Build Command."""
from pathlib import Path

from assets import asset_status

if __name__ == "__main__":
    status = asset_status(Path(__file__).resolve().parent / "static")
    if not status["ready"]:
        for kind in ("missing", "invalid"):
            for path in status[kind]:
                print(f"ERROR {kind}: static/{path}")
        raise SystemExit("Inference assets incomplete. Add the actual model/WASM files to Git before deploying.")
    print("OK: model, JavaScript and all WASM variants are present.")

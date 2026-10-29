"""Check inference assets before publishing a deploy that cannot run gestures."""
from pathlib import Path

ASSETS = {
    "models/hand_landmarker.task": b"\x00\x00PK",
    "vendor/mediapipe/vision_bundle.mjs": None,
    **{
        f"vendor/mediapipe/wasm/{name}.{extension}": signature
        for name in ("vision_wasm_internal", "vision_wasm_module_internal", "vision_wasm_nosimd_internal")
        for extension, signature in (("js", None), ("wasm", b"\x00asm"))
    },
}


def asset_status(static_dir: Path) -> dict:
    missing, invalid = [], []
    for relative_path, signature in ASSETS.items():
        path = static_dir / relative_path
        if not path.is_file():
            missing.append(relative_path)
            continue
        with path.open("rb") as asset:
            header = asset.read(100)
        # A Git LFS pointer or a downloaded HTML error page is not a model.
        if path.stat().st_size < 1024 or (signature and not header.startswith(signature)) or header.lstrip().lower().startswith((b"<!doctype html", b"<html")):
            invalid.append(relative_path)
    return {"ready": not missing and not invalid, "missing": missing, "invalid": invalid}

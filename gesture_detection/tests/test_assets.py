import tempfile
import unittest
from pathlib import Path

from gesture_detection.assets import ASSETS, asset_status


class AssetChecks(unittest.TestCase):
    def test_missing_files_are_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            status = asset_status(Path(directory))
            self.assertFalse(status["ready"])
            self.assertEqual(set(status["missing"]), set(ASSETS))

    def test_valid_headers_pass_but_lfs_pointer_and_html_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative_path, signature in ASSETS.items():
                path = root / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes((signature or b"// JS") + b" " * 1100)
            self.assertTrue(asset_status(root)["ready"])
            wasm = "vendor/mediapipe/wasm/vision_wasm_internal.wasm"
            (root / wasm).write_bytes(b"version https://git-lfs.github.com/spec/v1\n" + b" " * 1100)
            script = "vendor/mediapipe/vision_bundle.mjs"
            (root / script).write_bytes(b"<!doctype html>" + b" " * 1100)
            status = asset_status(root)
            self.assertFalse(status["ready"])
            self.assertCountEqual(status["invalid"], [wasm, script])


if __name__ == "__main__":
    unittest.main()

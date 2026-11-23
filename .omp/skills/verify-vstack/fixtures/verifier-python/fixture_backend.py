from pathlib import Path
from zipfile import ZipFile


# A dependency-free PEP 660 backend keeps the editable-install proof offline.
def build_editable(wheel_directory, config_settings=None, metadata_directory=None):
    dist = "vstack_verify_fixture-0.1.0.dist-info"
    filename = "vstack_verify_fixture-0.1.0-py3-none-any.whl"
    files = {
        "vstack_verify_fixture.pth": str(Path(__file__).resolve().parent / "src") + "\n",
        f"{dist}/METADATA": "Metadata-Version: 2.1\nName: vstack-verify-fixture\nVersion: 0.1.0\n",
        f"{dist}/WHEEL": "Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n",
    }
    record = f"{dist}/RECORD"
    files[record] = "".join(f"{path},,\n" for path in (*files, record))
    with ZipFile(Path(wheel_directory) / filename, "w") as wheel:
        for name, content in files.items():
            wheel.writestr(name, content)
    return filename

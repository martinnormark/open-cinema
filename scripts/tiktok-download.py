#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = ["yt-dlp[default,curl-cffi]"]
# ///
"""Download a TikTok video by its numeric video ID.

    python3 scripts/tiktok-download.py 7387143945744141599
    python3 scripts/tiktok-download.py 7387143945744141599 -o footage/
    uv run scripts/tiktok-download.py 7387143945744141599

The ID is the number after /video/ in a TikTok URL. A full URL is accepted too.
Needs: pip install "yt-dlp[default,curl-cffi]" (curl-cffi lets yt-dlp pass
TikTok's browser check; without it TikTok usually refuses the request).
"""

import argparse
import re
import sys
from pathlib import Path

ID_PATTERN = re.compile(r"^\d{15,25}$")
URL_ID_PATTERN = re.compile(r"/(?:video|photo|v)/(\d{15,25})")


def parse_id(value: str) -> str:
    value = value.strip()
    if ID_PATTERN.match(value):
        return value
    match = URL_ID_PATTERN.search(value)
    if match:
        return match.group(1)
    raise ValueError(
        f"'{value}' is not a TikTok video ID. Expected the long number from a URL "
        "like tiktok.com/@user/video/7387143945744141599"
    )


def explain(message: str) -> str:
    text = message.lower()
    if "private" in text:
        return "This video is private, so it can't be downloaded."
    if "log in" in text or "login" in text or "age-restricted" in text or "age restricted" in text:
        return "TikTok wants a signed-in account for this video (age-restricted or limited)."
    if "unavailable" in text or "not available" in text or "status code 10204" in text or "404" in text:
        return "TikTok says this video doesn't exist or was removed. Check the ID."
    if "ip address is blocked" in text:
        return (
            "TikTok refused this post. It usually means the ID doesn't exist, "
            "or the video is blocked in this region."
        )
    if "impersonat" in text or "unexpected response" in text:
        return (
            "TikTok blocked the request. Install impersonation support with\n"
            '  pip install "yt-dlp[default,curl-cffi]"\n'
            "and update yt-dlp (pip install -U yt-dlp)."
        )
    return message


class QuietLogger:
    """Keep yt-dlp's own output off the terminal; errors are reported via explain()."""

    def debug(self, message: str) -> None:
        pass

    info = warning = error = debug


def main() -> int:
    parser = argparse.ArgumentParser(description="Download a TikTok video by its video ID.")
    parser.add_argument("video_id", help="numeric TikTok video ID (or a full TikTok URL)")
    parser.add_argument("-o", "--output-dir", default=".", help="folder to save into (default: current folder)")
    parser.add_argument("--overwrite", action="store_true", help="replace the file if it already exists")
    args = parser.parse_args()

    try:
        video_id = parse_id(args.video_id)
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    try:
        import yt_dlp
        from yt_dlp.utils import DownloadError
    except ImportError:
        print('error: yt-dlp is not installed. Run: pip install "yt-dlp[default,curl-cffi]"', file=sys.stderr)
        return 1

    output_dir = Path(args.output_dir).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)

    # The extractor resolves the real uploader from the ID; the handle in the URL is ignored.
    url = f"https://www.tiktok.com/@_/video/{video_id}"
    options = {
        "outtmpl": str(output_dir / "tiktok-%(id)s-%(uploader|unknown)s.%(ext)s"),
        "format": "bv*+ba/b",
        # Prefer H.264 over TikTok's HEVC renditions so the file plays in every browser.
        "format_sort": ["vcodec:h264"],
        "merge_output_format": "mp4",
        "overwrites": args.overwrite,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "logger": QuietLogger(),
        "restrictfilenames": True,
    }

    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=True)
            path = Path(info["requested_downloads"][0]["filepath"])
    except DownloadError as error:
        print(f"error: {explain(str(error))}", file=sys.stderr)
        return 1

    print(path)
    print(
        f"  @{info.get('uploader', '?')} · {info.get('duration', '?')}s · "
        f"{info.get('width', '?')}x{info.get('height', '?')}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

from __future__ import annotations

import qrcode
from qrcode.constants import ERROR_CORRECT_M


def matrix(text: str, border: int = 2) -> list[list[bool]]:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, border=border)
    qr.add_data(text)
    qr.make(fit=True)
    return qr.get_matrix()


def render_terminal(text: str, invert: bool = False) -> str:
    """Half-block QR. Default assumes a dark terminal (light modules drawn as filled blocks)."""
    m = matrix(text)
    if len(m) % 2:
        m.append([False] * len(m[0]))
    # `lit` is what gets drawn as a filled block
    lit = (lambda dark: dark) if invert else (lambda dark: not dark)
    rows = []
    for y in range(0, len(m), 2):
        line = []
        for top, bottom in zip(m[y], m[y + 1]):
            t, b = lit(top), lit(bottom)
            line.append("█" if t and b else "▀" if t else "▄" if b else " ")
        rows.append("".join(line))
    return "\n".join(rows)


def render_svg(text: str) -> str:
    m = matrix(text, border=2)
    n = len(m)
    rects = "".join(
        f'<rect x="{x}" y="{y}" width="1" height="1"/>'
        for y, row in enumerate(m)
        for x, dark in enumerate(row)
        if dark
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" shape-rendering="crispEdges">'
        f'<rect width="{n}" height="{n}" fill="#fff"/><g fill="#000">{rects}</g></svg>'
    )

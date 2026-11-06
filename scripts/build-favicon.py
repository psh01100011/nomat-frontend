"""작은 SVG favicon을 외부 패키지 없이 PNG 기반 ICO로 만든다."""
import pathlib
import struct
import xml.etree.ElementTree as ET
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
source = ET.parse(ROOT / 'public/favicon.svg').getroot()
rectangle, polygon = list(source)
size, scale = 32, 4
assert source.attrib['viewBox'] == '0 0 32 32'
radius = float(rectangle.attrib['rx'])
background = bytes.fromhex(rectangle.attrib['fill'][1:])
foreground = bytes.fromhex(polygon.attrib['fill'][1:])
points = [tuple(map(float, pair.split(','))) for pair in polygon.attrib['points'].split()]


def inside(x, y):
    result = False
    previous = points[-1]
    for point in points:
        x1, y1 = previous
        x2, y2 = point
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            result = not result
        previous = point
    return result


pixels = bytearray()
for y in range(size):
    pixels.append(0)  # PNG row filter
    for x in range(size):
        colors = []
        for sy in range(scale):
            for sx in range(scale):
                px, py = x + (sx + 0.5) / scale, y + (sy + 0.5) / scale
                dx, dy = max(radius - px, 0, px - (size - radius)), max(radius - py, 0, py - (size - radius))
                if dx * dx + dy * dy <= radius * radius:
                    colors.append(foreground if inside(px, py) else background)
        rgb = [round(sum(color[channel] for color in colors) / len(colors)) if colors else 0 for channel in range(3)]
        pixels.extend([*rgb, round(255 * len(colors) / (scale * scale))])


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) +
       chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b''))
ico = struct.pack('<HHH', 0, 1, 1) + struct.pack('<BBBBHHII', size, size, 0, 0, 1, 32, len(png), 22) + png
(ROOT / 'public/favicon.ico').write_bytes(ico)
print('favicon.ico 생성 완료: 32×32, PNG 기반 ICO')

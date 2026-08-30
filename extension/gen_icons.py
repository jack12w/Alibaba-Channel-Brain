import struct
import zlib
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icons')
os.makedirs(OUT, exist_ok=True)

BLUE = (15, 107, 255)
WHITE = (255, 255, 255)


def chunk(typ, data):
    c = struct.pack('>I', len(data)) + typ + data
    return c + struct.pack('>I', zlib.crc32(typ + data) & 0xFFFFFFFF)


def make_png(size, bg, fg):
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    raw = b''
    # 圆角简化：纯色底 + 中央白色方块（简化绘制，避免复杂字体）
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            # 中央菱形白色标记
            dx = abs(x - (size - 1) / 2)
            dy = abs(y - (size - 1) / 2)
            if dx + dy <= size * 0.32:
                row += bytes(fg)
            else:
                row += bytes(bg)
        raw += bytes(row)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(os.path.join(OUT, 'icon%d.png' % size), 'wb') as f:
        f.write(png)
    print('icon%d.png %d bytes' % (size, len(png)))


for s in (16, 48, 128):
    make_png(s, BLUE, WHITE)
print('done')

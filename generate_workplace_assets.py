import os
import shutil
from PIL import Image, ImageDraw, ImageFilter

brain_dir = r"C:\Users\Pc\.gemini\antigravity\brain\21da9260-247d-4a30-af3d-f67ffccbe23b"
blackhole_src = os.path.join(brain_dir, ".user_uploaded", "media_1792304445039_57a0e411.jpg")
lockup_src = os.path.join(brain_dir, ".user_uploaded", "media_1792304444994_a40bf3a7.jpg")

# Destinations
flutter_assets = r"c:\Users\Pc\Quant-Ecosystem\flutter_apps\apps\quant_mail\assets"
web_brand = r"c:\Users\Pc\Quant-Ecosystem\apps\quantmail\public\brand"

os.makedirs(flutter_assets, exist_ok=True)
os.makedirs(web_brand, exist_ok=True)

# 1. Copy files
shutil.copy2(blackhole_src, os.path.join(flutter_assets, "quantrinity_blackhole.jpg"))
shutil.copy2(lockup_src, os.path.join(flutter_assets, "quantrinity_lockup.jpg"))

shutil.copy2(blackhole_src, os.path.join(web_brand, "quantrinity-blackhole.jpg"))
shutil.copy2(lockup_src, os.path.join(web_brand, "quantrinity-lockup.jpg"))

print("Assets copied successfully!")

# 2. Generate QuantWorkplace App Icon (1024x1024 master, then resize for mipmap)
# Outer size: 1024x1024
master_size = 1024
icon = Image.new("RGBA", (master_size, master_size), (0, 0, 0, 0))
draw = ImageDraw.Draw(icon)

# Draw deep dark obsidian background circle
cx, cy = master_size // 2, master_size // 2
radius = 480
draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(4, 5, 8, 255))

# Outer subtle luxury rim
draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=(226, 232, 240, 100), width=6)

# Load mascots
mascot_dir = os.path.join(flutter_assets, "mascots")
mascot_files = [
    ("mail_md.png", (255, 107, 53)),       # Top (QuantMail)
    ("calendar_md.png", (66, 133, 244)),   # Top-Right (QuantCalendar)
    ("drive_md.png", (52, 168, 83)),       # Bottom-Right (QuantDrive)
    ("contacts_md.png", (245, 158, 11)),   # Bottom-Left (QuantContacts)
    ("quantgit_md.png", (139, 92, 246))    # Top-Left (QuantGit)
]

import math

# Draw connected ring arms / bridge
orbit_r = 300
node_r = 115

# Draw smoked pearl connecting bridge
for i in range(5):
    angle = -math.pi / 2 + (i * 2 * math.pi / 5)
    nx = cx + orbit_r * math.cos(angle)
    ny = cy + orbit_r * math.sin(angle)
    # Spoke connecting center to node
    draw.line([(cx, cy), (nx, ny)], fill=(226, 232, 240, 70), width=48)

# Center Black Hole core
bh_img = Image.open(blackhole_src).convert("RGBA")
# Make circular mask for black hole
bh_size = 320
bh_resized = bh_img.resize((bh_size, bh_size), Image.Resampling.LANCZOS)
mask = Image.new("L", (bh_size, bh_size), 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.ellipse([0, 0, bh_size, bh_size], fill=255)

# Paste center black hole
icon.paste(bh_resized, (cx - bh_size // 2, cy - bh_size // 2), mask)
# Center ring gold rim
draw.ellipse([cx - bh_size // 2, cy - bh_size // 2, cx + bh_size // 2, cy + bh_size // 2], outline=(255, 251, 235, 220), width=6)

# Draw 5 app nodes and paste mascots
for i, (m_name, color) in enumerate(mascot_files):
    angle = -math.pi / 2 + (i * 2 * math.pi / 5)
    nx = int(cx + orbit_r * math.cos(angle))
    ny = int(cy + orbit_r * math.sin(angle))
    
    # Node backing circle
    draw.ellipse([nx - node_r, ny - node_r, nx + node_r, ny + node_r], fill=(7, 9, 14, 255))
    # Colored ring
    draw.ellipse([nx - node_r, ny - node_r, nx + node_r, ny + node_r], outline=color + (255,), width=16)
    
    # Mascot
    m_path = os.path.join(mascot_dir, m_name)
    if os.path.exists(m_path):
        m_img = Image.open(m_path).convert("RGBA")
        m_sz = int(node_r * 1.35)
        m_resized = m_img.resize((m_sz, m_sz), Image.Resampling.LANCZOS)
        icon.paste(m_resized, (nx - m_sz // 2, ny - m_sz // 2), m_resized)

# Save master icon for web
icon.save(os.path.join(web_brand, "quantworkplace-icon.png"), "PNG")
print("Saved master web icon!")

# Save to Android mipmaps
res_dir = r"c:\Users\Pc\Quant-Ecosystem\flutter_apps\apps\quant_mail\android\app\src\main\res"
mipmap_sizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192
}

for folder, sz in mipmap_sizes.items():
    target_dir = os.path.join(res_dir, folder)
    target_file = os.path.join(target_dir, "ic_launcher.png")
    resized = icon.resize((sz, sz), Image.Resampling.LANCZOS)
    resized.save(target_file, "PNG")
    print(f"Saved {folder}/ic_launcher.png ({sz}x{sz})")

print("All icons successfully generated!")

import os
from PIL import Image, ImageDraw, ImageFilter

def create_quant_icon(size, is_round=False):
    # Create canvas with RGBA
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background: Luxury Deep Obsidian
    bg_color = (11, 12, 14, 255)
    if is_round:
        draw.ellipse([0, 0, size - 1, size - 1], fill=bg_color)
    else:
        corner_radius = int(size * 0.22)
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=corner_radius, fill=bg_color)
    
    center = size / 2.0
    
    # Concentric cyber rings in background
    for ring_frac, alpha in [(0.44, 40), (0.36, 60), (0.28, 80)]:
        r_box = [center - size * ring_frac, center - size * ring_frac, center + size * ring_frac, center + size * ring_frac]
        draw.ellipse(r_box, outline=(255, 140, 66, alpha), width=max(1, int(size * 0.015)))
    
    # Multi-layer ambient radial glow
    r_glow_max = size * 0.32
    for step in range(16, 0, -1):
        r_current = r_glow_max + step * (size * 0.012)
        alpha = int(22 * (1.0 - step / 16.0))
        g_box = [center - r_current, center - r_current, center + r_current, center + r_current]
        draw.ellipse(g_box, fill=(255, 107, 0, alpha))
        
    # Main Sovereign Core (Vibrant Amber Gradient simulated)
    r_core = size * 0.24
    draw.ellipse([center - r_core, center - r_core, center + r_core, center + r_core], fill=(255, 120, 20, 255))
    
    r_inner = size * 0.17
    draw.ellipse([center - r_inner, center - r_inner, center + r_inner, center + r_inner], fill=(255, 175, 55, 255))
    
    r_hot = size * 0.10
    draw.ellipse([center - r_hot, center - r_hot, center + r_hot, center + r_hot], fill=(255, 225, 130, 255))
    
    # Specular Glint
    r_spec = size * 0.05
    offset = size * 0.04
    draw.ellipse([center - r_spec - offset, center - r_spec - offset, center + r_spec - offset, center + r_spec - offset], fill=(255, 255, 255, 240))
    
    # Orbital Ring (Rotated 35 degrees)
    orbit_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    orbit_draw = ImageDraw.Draw(orbit_img)
    orbit_w = size * 0.74
    orbit_h = size * 0.26
    orbit_box = [center - orbit_w/2, center - orbit_h/2, center + orbit_w/2, center + orbit_h/2]
    orbit_draw.ellipse(orbit_box, outline=(255, 220, 140, 240), width=max(2, int(size * 0.038)))
    
    # Orbital Satellite / Electron Node
    sat_r = size * 0.045
    sat_center_x = center + orbit_w/2 * 0.88
    sat_center_y = center
    orbit_draw.ellipse([sat_center_x - sat_r, sat_center_y - sat_r, sat_center_x + sat_r, sat_center_y + sat_r], fill=(255, 255, 255, 255))
    orbit_draw.ellipse([sat_center_x - sat_r*1.5, sat_center_y - sat_r*1.5, sat_center_x + sat_r*1.5, sat_center_y + sat_r*1.5], fill=(255, 140, 0, 80))
    
    orbit_rot = orbit_img.rotate(-35, resample=Image.BICUBIC, center=(center, center))
    img.alpha_composite(orbit_rot)
    
    return img

def main():
    base_res = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'android-project', 'app', 'src', 'main', 'res')
    
    densities = {
        'mipmap-mdpi': 48,
        'mipmap-hdpi': 72,
        'mipmap-xhdpi': 96,
        'mipmap-xxhdpi': 144,
        'mipmap-xxxhdpi': 192
    }
    
    for folder, size in densities.items():
        folder_path = os.path.join(base_res, folder)
        os.makedirs(folder_path, exist_ok=True)
        
        # Generate standard icon
        icon_standard = create_quant_icon(size, is_round=False)
        out_standard = os.path.join(folder_path, 'ic_launcher.webp')
        icon_standard.save(out_standard, 'WEBP', quality=100)
        
        # Generate round icon
        icon_round = create_quant_icon(size, is_round=True)
        out_round = os.path.join(folder_path, 'ic_launcher_round.webp')
        icon_round.save(out_round, 'WEBP', quality=100)
        
        print(f"Generated {out_standard} and {out_round} ({size}x{size})")

if __name__ == '__main__':
    main()

// ============================================================================
// QuantChat - ChatThemes Component
// Theme gallery: color themes, custom wallpaper, emoji, gradients, per-convo
// ============================================================================
import React, { useState, useCallback, useRef } from 'react';

interface ChatTheme { id: string; name: string; type: 'solid' | 'gradient' | 'wallpaper' | 'emoji'; bubbleColor: string; textColor: string; backgroundColor: string; gradientColors?: string[]; wallpaperUrl?: string; emojiPattern?: string; }
interface ChatThemesProps { currentTheme?: string; onThemeSelect: (theme: ChatTheme) => void; conversationId: string; }

const PRESET_THEMES: ChatTheme[] = [
  { id: 'default', name: 'Default', type: 'solid', bubbleColor: '#FFFC00', textColor: '#000000', backgroundColor: '#1C1C1E' },
  { id: 'ocean', name: 'Ocean', type: 'gradient', bubbleColor: '#4FC3F7', textColor: '#FFFFFF', backgroundColor: '#0D47A1', gradientColors: ['#0D47A1', '#1565C0', '#42A5F5'] },
  { id: 'sunset', name: 'Sunset', type: 'gradient', bubbleColor: '#FF7043', textColor: '#FFFFFF', backgroundColor: '#BF360C', gradientColors: ['#FF6F00', '#FF8F00', '#FFA000'] },
  { id: 'forest', name: 'Forest', type: 'gradient', bubbleColor: '#66BB6A', textColor: '#FFFFFF', backgroundColor: '#1B5E20', gradientColors: ['#1B5E20', '#2E7D32', '#43A047'] },
  { id: 'midnight', name: 'Midnight', type: 'solid', bubbleColor: '#7C4DFF', textColor: '#FFFFFF', backgroundColor: '#1A237E' },
  { id: 'cotton_candy', name: 'Cotton Candy', type: 'gradient', bubbleColor: '#F48FB1', textColor: '#FFFFFF', backgroundColor: '#FCE4EC', gradientColors: ['#F8BBD0', '#CE93D8', '#B39DDB'] },
  { id: 'neon', name: 'Neon', type: 'solid', bubbleColor: '#76FF03', textColor: '#000000', backgroundColor: '#212121' },
  { id: 'minimal', name: 'Minimal', type: 'solid', bubbleColor: '#E0E0E0', textColor: '#000000', backgroundColor: '#FFFFFF' },
  { id: 'lavender', name: 'Lavender', type: 'gradient', bubbleColor: '#B388FF', textColor: '#FFFFFF', backgroundColor: '#4A148C', gradientColors: ['#4A148C', '#6A1B9A', '#AB47BC'] },
  { id: 'fire', name: 'Fire', type: 'gradient', bubbleColor: '#FF5722', textColor: '#FFFFFF', backgroundColor: '#3E2723', gradientColors: ['#BF360C', '#E64A19', '#FF5722'] },
  { id: 'arctic', name: 'Arctic', type: 'gradient', bubbleColor: '#80DEEA', textColor: '#000000', backgroundColor: '#E0F7FA', gradientColors: ['#B2EBF2', '#80DEEA', '#4DD0E1'] },
  { id: 'rose_gold', name: 'Rose Gold', type: 'solid', bubbleColor: '#E8B4B8', textColor: '#4A1C1C', backgroundColor: '#FFF0F0' },
];

const EMOJI_PATTERNS = ['\u2764\uFE0F', '\u2B50', '\u{1F33C}', '\u{1F33A}', '\u2744\uFE0F', '\u{1F525}', '\u{1F31F}', '\u{1F308}', '\u{1F98B}', '\u{1F340}'];

export const ChatThemes: React.FC<ChatThemesProps> = ({ currentTheme, onThemeSelect, conversationId }) => {
  const [selectedTheme, setSelectedTheme] = useState<string>(currentTheme || 'default');
  const [customColor, setCustomColor] = useState<string>('#FFFC00');
  const [customBg, setCustomBg] = useState<string>('#1C1C1E');
  const [showCustom, setShowCustom] = useState<boolean>(false);
  const [uploadedWallpaper, setUploadedWallpaper] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'presets' | 'custom' | 'wallpaper' | 'emoji'>('presets');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePresetSelect = useCallback((theme: ChatTheme) => {
    setSelectedTheme(theme.id);
    onThemeSelect(theme);
  }, [onThemeSelect]);

  const handleCustomApply = useCallback(() => {
    const theme: ChatTheme = { id: 'custom', name: 'Custom', type: 'solid', bubbleColor: customColor, textColor: '#FFFFFF', backgroundColor: customBg };
    onThemeSelect(theme);
    setSelectedTheme('custom');
  }, [customColor, customBg, onThemeSelect]);

  const handleWallpaperUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setUploadedWallpaper(url);
      const theme: ChatTheme = { id: 'wallpaper_custom', name: 'Custom Wallpaper', type: 'wallpaper', bubbleColor: '#FFFC00', textColor: '#000000', backgroundColor: '#000000', wallpaperUrl: url };
      onThemeSelect(theme);
      setSelectedTheme('wallpaper_custom');
    };
    reader.readAsDataURL(file);
  }, [onThemeSelect]);

  const handleEmojiPattern = useCallback((emoji: string) => {
    const theme: ChatTheme = { id: `emoji_${emoji}`, name: `${emoji} Pattern`, type: 'emoji', bubbleColor: '#FFFC00', textColor: '#000000', backgroundColor: '#1C1C1E', emojiPattern: emoji };
    onThemeSelect(theme);
    setSelectedTheme(`emoji_${emoji}`);
  }, [onThemeSelect]);

  const getThemePreviewStyle = (theme: ChatTheme): React.CSSProperties => {
    if (theme.type === 'gradient' && theme.gradientColors) { return { background: `linear-gradient(135deg, ${theme.gradientColors.join(', ')})` }; }
    return { backgroundColor: theme.backgroundColor };
  };

  return (
    <div className="chat-themes">
      <h2>Chat Theme</h2>
      <p className="theme-subtitle">Personalize this conversation</p>
      <nav className="theme-sections"><button onClick={() => setActiveSection('presets')} className={activeSection === 'presets' ? 'active' : ''}>Themes</button><button onClick={() => setActiveSection('custom')} className={activeSection === 'custom' ? 'active' : ''}>Custom</button><button onClick={() => setActiveSection('wallpaper')} className={activeSection === 'wallpaper' ? 'active' : ''}>Wallpaper</button><button onClick={() => setActiveSection('emoji')} className={activeSection === 'emoji' ? 'active' : ''}>Emoji</button></nav>

      {activeSection === 'presets' && (
        <div className="themes-grid">{PRESET_THEMES.map(theme => (
          <div key={theme.id} className={`theme-card ${selectedTheme === theme.id ? 'selected' : ''}`} onClick={() => handlePresetSelect(theme)} style={getThemePreviewStyle(theme)}>
            <div className="theme-bubble-preview" style={{ backgroundColor: theme.bubbleColor }}><span style={{ color: theme.textColor }}>Hi!</span></div>
            <span className="theme-name">{theme.name}</span>
          </div>
        ))}</div>
      )}

      {activeSection === 'custom' && (
        <div className="custom-theme">
          <div className="color-pickers"><div className="picker-group"><label>Bubble Color</label><input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} /><span>{customColor}</span></div><div className="picker-group"><label>Background</label><input type="color" value={customBg} onChange={(e) => setCustomBg(e.target.value)} /><span>{customBg}</span></div></div>
          <div className="custom-preview" style={{ backgroundColor: customBg, padding: '20px', borderRadius: '12px' }}><div style={{ backgroundColor: customColor, padding: '8px 16px', borderRadius: '16px', display: 'inline-block' }}><span style={{ color: '#fff' }}>Preview message</span></div></div>
          <button onClick={handleCustomApply} className="apply-btn">Apply Custom Theme</button>
        </div>
      )}

      {activeSection === 'wallpaper' && (
        <div className="wallpaper-section">
          <button onClick={() => fileInputRef.current?.click()} className="upload-wallpaper-btn">Upload Wallpaper</button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleWallpaperUpload} />
          {uploadedWallpaper && (<div className="wallpaper-preview"><img src={uploadedWallpaper} alt="Wallpaper preview" /><button onClick={() => { setUploadedWallpaper(null); }}>Remove</button></div>)}
          <div className="gradient-presets"><h4>Gradient Backgrounds</h4>{PRESET_THEMES.filter(t => t.type === 'gradient').map(t => (<div key={t.id} className={`gradient-option ${selectedTheme === t.id ? 'selected' : ''}`} onClick={() => handlePresetSelect(t)} style={getThemePreviewStyle(t)}><span>{t.name}</span></div>))}</div>
        </div>
      )}

      {activeSection === 'emoji' && (
        <div className="emoji-section"><h4>Emoji Patterns</h4><div className="emoji-grid">{EMOJI_PATTERNS.map(emoji => (<button key={emoji} onClick={() => handleEmojiPattern(emoji)} className={`emoji-option ${selectedTheme === `emoji_${emoji}` ? 'selected' : ''}`}><span className="emoji-large">{emoji}</span></button>))}</div></div>
      )}
    </div>
  );
};

export default ChatThemes;

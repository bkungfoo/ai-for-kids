/** Picker options for the kids' music maker — shared by the API and the UI. */

export const MUSIC_STYLES = [
  { id: 'pop', label: 'Pop', icon: '🎤' },
  { id: 'jazz', label: 'Jazz', icon: '🎷' },
  { id: 'rnb', label: 'R&B', icon: '🎶' },
  { id: 'kpop', label: 'K-Pop', icon: '🌟' },
  { id: 'classical', label: 'Classical', icon: '🎻' },
  { id: 'edm', label: 'EDM', icon: '🎛️' },
  { id: 'rock', label: 'Rock', icon: '🎸' },
  { id: 'metal', label: 'Metal', icon: '🤘' },
  { id: 'game', label: 'Video game', icon: '🎮' },
  { id: 'lofi', label: 'Lo-fi', icon: '🎧' },
] as const;

export const MUSIC_MOODS = [
  { id: 'lively', label: 'Lively', icon: '⚡' },
  { id: 'happy', label: 'Happy', icon: '😄' },
  { id: 'chill', label: 'Chill', icon: '😌' },
  { id: 'dreamy', label: 'Dreamy', icon: '💭' },
  { id: 'melancholy', label: 'Melancholy', icon: '🌧️' },
  { id: 'angry', label: 'Angry', icon: '😠' },
  { id: 'epic', label: 'Epic', icon: '🏔️' },
  { id: 'silly', label: 'Silly', icon: '🤪' },
] as const;

/** How each picker id reads inside the generation description. */
export const STYLE_PHRASES: Record<string, string> = {
  pop: 'upbeat pop',
  jazz: 'swinging jazz',
  rnb: 'smooth R&B',
  kpop: 'catchy K-pop',
  classical: 'orchestral classical music',
  edm: 'energetic EDM dance music',
  rock: 'rock',
  metal: 'kid-friendly melodic metal',
  game: 'adventurous video-game chiptune',
  lofi: 'cozy lo-fi beats',
};

export const MOOD_PHRASES: Record<string, string> = {
  lively: 'lively and energetic',
  happy: 'happy and bright',
  chill: 'calm and chill',
  dreamy: 'dreamy and floaty',
  melancholy: 'gently melancholy but comforting',
  angry: 'stompy and fierce (but fun, never hateful)',
  epic: 'epic and heroic',
  silly: 'silly and giggly',
};

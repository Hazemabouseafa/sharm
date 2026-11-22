export const BRAND_TOKENS = {
  petrol: '#103D45',
  petrolDark: '#0A292F',
  turquoise: '#18A5A0',
  turquoiseAccessible: '#0E7C78', // >= 4.8:1 contrast on white/ivory
  gold: '#C9A66B',
  goldAccessible: '#8A6828', // >= 4.6:1 contrast on white/ivory
  ivory: '#F7F5EF',
  ivoryBorder: '#E5DFD2',
  white: '#FFFFFF',
  ink: '#103D45',
  body: '#334155',
  muted: '#52606D',
} as const;

export const SECTION_BG_CLASSES: Record<string, string> = {
  petrol: 'bg-[#103D45] text-white',
  turquoise: 'bg-[#0E7C78] text-white',
  gold: 'bg-[#F5ECD9] text-[#103D45]',
  ivory: 'bg-[#F7F5EF] text-[#103D45]',
  white: 'bg-white text-[#103D45]',
  slate: 'bg-slate-100 text-[#103D45]',
};

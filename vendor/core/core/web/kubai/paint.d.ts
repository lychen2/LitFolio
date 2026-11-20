export interface KubaiImages {
  light: string;
  dark: string;
}

export function kubaiImages(source: string, theme?: string): KubaiImages;

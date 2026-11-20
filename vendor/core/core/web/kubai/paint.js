// Kubai's static export identifies the front/back plates in the paint IDs and
// uses a fixed set of paints for linework. Keep that geometry and the masks,
// and replace those paints before either surface loads the SVG as an image.
const flatPaint = {
  "#766EA6": "edge",
  "#5D4983": "detail",
  "#6B6497": "detail",
  "#fff": "paper",
  "#E5E1F2": "soft-line",
  "#E0DEF0": "face",
  "#D1CCE8": "face",
  "#BEB8DF": "back",
  "#B8B2DC": "soft-line",
  "#B4ADDA": "soft-line",
};

// Each row follows the same roles, including strong linework against the
// surrounding surface and darker inner marks against the front plate.
const roles = ["edge", "back", "face", "detail", "line", "soft-line", "paper"];
const colors = {
  violet: {
    light: ["#3d475f", "#8997b2", "#bdcedd", "#263750", "#36445e", "#506382", "#f5f8fc"],
    dark: ["#c8d2e4", "#7f92b1", "#b9cbdf", "#25344e", "#e3ebf8", "#a8b9d6", "#f2f5fd"],
  },
  warm: {
    light: ["#504631", "#a58c64", "#ded0ab", "#3c3425", "#49402e", "#6a5a3c", "#fcf7ea"],
    dark: ["#e6d6b5", "#ac946b", "#e0cda2", "#3b3022", "#f5ead0", "#cbb48b", "#f9f0df"],
  },
  blueprint: {
    light: ["#38546c", "#759db5", "#b9dbe4", "#233b51", "#324e64", "#426e88", "#f5fbff"],
    dark: ["#bfd8e8", "#648caf", "#b2d7e4", "#1c3348", "#e1f1fb", "#91bbd1", "#edf8ff"],
  },
};

function declarations(paints) {
  return roles.map((role, index) => `--kubai-${role}:${paints[index]}`).join(";");
}

const palettes = Object.fromEntries(Object.entries(colors).map(([theme, { light, dark }]) => [theme,
  { light: declarations(light), dark: declarations(dark) },
]));

/** @param {string} source Kubai SVG or a compact glyph using the same paint roles.
 * @param {string} [theme] LitFolio theme, defaulting to violet. */
export function kubaiImages(source, theme = "violet") {
  const palette = Object.hasOwn(palettes, theme) ? palettes[theme] : palettes.violet;
  const svg = source
    .replace(/<(filter|linearGradient)\b[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/ filter="url\(#[^)]+\)"/g, "")
    .replace(/<mask\b[^>]*>[\s\S]*?<\/mask>|\b(fill|stroke)="([^"\n]+)"/g, (attribute, property, paint) => {
      if (!property) return attribute;
      const gradient = /^url\(#[^)]+-(upS?|loS?|pure)-[^)]+\)$/.exec(paint);
      if (gradient) {
        const role = gradient[1].startsWith("up") ? "face" : gradient[1].startsWith("lo") ? "back" : "detail";
        return `fill="var(--kubai-${role})"`;
      }
      const role = flatPaint[paint];
      return role ? `${property}="var(--kubai-${role})"` : attribute;
    });
  // WebKitGTK evaluates media queries inside SVG images against the OS theme.
  // Give the host both paints so the button's actual background selects its ink.
  const image = (paint) => {
    const painted = svg.replace(/<svg\b[^>]*>/, (root) => `${root}<style>:root{${paint}}</style>`);
    return `data:image/svg+xml,${encodeURIComponent(painted)}`;
  };
  return { light: image(palette.light), dark: image(palette.dark) };
}

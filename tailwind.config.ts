import type { Config } from "tailwindcss";

/** Токен → цвет Tailwind с поддержкой alpha-модификаторов (bg-surface/50). */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  // Тему переключает атрибут data-theme на <html>.
  // Почти вся вёрстка обходится семантическими токенами и не нуждается в dark:,
  // вариант оставлен для редких мест, где отличается природа стиля, а не цвет.
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        "surface-2": token("surface-2"),
        "surface-3": token("surface-3"),

        hairline: token("border"),
        "hairline-strong": token("border-strong"),

        ink: token("text"),
        muted: token("text-muted"),
        faint: token("text-faint"),

        accent: {
          DEFAULT: token("accent"),
          hover: token("accent-hover"),
          ink: token("accent-ink"),
          text: token("accent-text"),
        },

        contrast: {
          DEFAULT: token("contrast"),
          ink: token("contrast-ink"),
        },

        // Экран плеера — тёмный в обеих темах.
        stage: {
          DEFAULT: token("stage"),
          ink: token("stage-ink"),
        },

        ok: { text: token("ok-text"), soft: token("ok-soft") },
        warn: { text: token("warn-text"), soft: token("warn-soft") },
        danger: { text: token("danger-text"), soft: token("danger-soft") },
        neutral: { text: token("neutral-text"), soft: token("neutral-soft") },
      },
      /* Страховка от главной ловушки двух тем.
         bg-accent  -> лаймовая ЗАЛИВКА (под ней всегда тёмный accent-ink).
         text-accent / border-accent / ring-accent -> тему-зависимый accent-text:
         олива в светлой (5.36:1) и лайм в тёмной (12.78:1).
         Так нечитаемый лайм текстом на белом становится недостижим в принципе. */
      // ВАЖНО: это ОБЪЕКТЫ, а не одно значение. Плоское
      // textColor: { accent: ... } затирает вложенную группу целиком,
      // и text-accent-ink перестаёт существовать — текст на лаймовых
      // кнопках тогда наследует цвет и в тёмной теме даёт 1.36:1.
      textColor: {
        accent: {
          DEFAULT: token("accent-text"),
          ink: token("accent-ink"),
          hover: token("accent-hover"),
        },
      },
      ringColor: { accent: { DEFAULT: token("accent-text") } },
      divideColor: { accent: { DEFAULT: token("accent-text") } },
      borderColor: {
        DEFAULT: token("border"),
        accent: { DEFAULT: token("accent-text") },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        tile: "20px",
        control: "12px",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        lift: "var(--shadow-lift)",
      },
      maxWidth: {
        shell: "1440px",
      },
      keyframes: {
        "ken-burns": {
          "0%": { transform: "scale(1) translate(0, 0)" },
          "100%": { transform: "scale(1.06) translate(-0.6%, -0.6%)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        xfade: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "ken-burns": "ken-burns 20s ease-out forwards",
        "fade-in": "fade-in 0.22s ease-out both",
        "scale-in": "scale-in 0.18s ease-out both",
        // Проявление нового кадра поверх предыдущего — та же длительность, что XFADE_SEC в экспорте.
        xfade: "xfade 0.45s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;

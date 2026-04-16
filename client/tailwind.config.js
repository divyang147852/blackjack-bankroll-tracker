/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#081018",
        carbon: "#0f1a24",
        mint: "#70f0b7",
        cyan: "#37c9ff",
        ember: "#ff8459",
        steel: "#8fa4b8"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(112,240,183,.2), 0 22px 40px -14px rgba(55,201,255,.28)"
      },
      animation: {
        rise: "rise .5s ease-out both"
      },
      keyframes: {
        rise: {
          "0%": { opacity: 0, transform: "translateY(12px)" },
          "100%": { opacity: 1, transform: "translateY(0)" }
        }
      }
    }
  },
  plugins: []
};

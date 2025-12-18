/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        Background: { // Neutral
          White_Base: '#FFFFFF',       // 0 (White)
          White_Primary: '#F8F9FC',    // 100 (Light Gray)
          White_Secondary: '#F1F3F9',  // 200 (Secondary Background)
          Black_Secondary: '#23272F',  // 800 (Secondary Background (Dark))
          Black_Primary: '#1B1F27',    // 900 (Primary Background (Dark))
          Black_Base: '#0A0D14',       // 1000 (Base Background (Black))
        },
        Line: {
          White: '#E1E6EF',    // 300 (Line)
          Black: '#3F444D',    // 700 (Line (Dark))
        },
        Blue: { // Primary
          '100_Background': '#F0F5FF',
          '700_Default': '#2F6FED',
          '800_Hover': '#1D5BD6',
          '900_Pressed': '#1E4EAE',
        },
        Purple: { // Secondary
          '100_Background': '#F8F5FF',
          '700_Default': '#8B54F7',
          '800_Hover': '#6D35DE',
          '900_Pressed': '#5221B5',
        },
        Success: {
          '100_Background': '#EDFDF8',
          '700_Default': '#08875D',
          '800_Hover': '#04724D',
          '900_Pressed': '#066042',
        },
        Warning: {
          '100_Background': '#FFF8EB',
          '700_Default': '#B25E09',
          '800_Hover': '#96530F',
          '900_Pressed': '#80460D',
        },
        Danger: {
          '100_Background': '#FEF1F2',
          '700_Default': '#E02D3C',
          '800_Hover': '#BA2532',
          '900_Pressed': '#981B25',
        },
        Text: {
          Black_Primary: '#333333',
          Black_Secondary: 'rgba(51, 51, 51, 0.8)', // #333333의 80% 투명도
          Black_Disabled: 'rgba(51, 51, 51, 0.65)', // #333333의 65% 투명도
          White_Primary: '#FFFFFF',
          White_Secondary: 'rgba(255, 255, 255, 0.75)', // #FFFFFF의 75% 투명도
          White_Disabled: 'rgba(255, 255, 255, 0.6)', // #FFFFFF의 60% 투명도
        },
      },
      fontFamily: {
        pretendard: ['PretendardVariable'],
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.22_bold': {
          fontFamily: 'PretendardVariable',
          fontSize: '22px',
          fontWeight: '700',
          lineHeight: '1.5',
          letterSpacing: '-0.02em',
        },
        '.18_bold': {
          fontFamily: 'PretendardVariable',
          fontSize: '18px',
          fontWeight: '700',
          lineHeight: '1.5',
          letterSpacing: '-0.02em',
        },
        '.16_bold': {
          fontFamily: 'PretendardVariable',
          fontSize: '16px',
          fontWeight: '700',
          lineHeight: '1.5',
          letterSpacing: '-0.02em',
        },
        '.15_semibold': {
          fontFamily: 'PretendardVariable',
          fontSize: '15px',
          fontWeight: '600',
          lineHeight: '1.5',
          letterSpacing: '-0.02em',
        },
        '.15_regular': {
          fontFamily: 'PretendardVariable',
          fontSize: '15px',
          fontWeight: '400',
          lineHeight: '1.5',
          letterSpacing: '-0.02em',
        },
        '.14_bold': {
          fontFamily: 'PretendardVariable',
          fontSize: '14px',
          fontWeight: '700',
          lineHeight: '1.5',
          letterSpacing: '-0.02em',
        },
        '.14_regular': {
          fontFamily: 'PretendardVariable',
          fontSize: '14px',
          fontWeight: '400',
          lineHeight: '1.5',
          letterSpacing: '-0.02em',
        },
      });
    },
  ],
}
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
          'Background-100': '#F0F5FF',
          'Default-700': '#2F6FED',
          'Hover-800': '#1D5BD6',
          'Pressed-900': '#1E4EAE',
        },
        Purple: { // Secondary
          'Background-100': '#F8F5FF',
          'Default-700': '#8B54F7',
          'Hover-800': '#6D35DE',
          'Pressed-900': '#5221B5',
        },
        Success: {
          'Background-100': '#EDFDF8',
          'Default-700': '#08875D',
          'Hover-800': '#04724D',
          'Pressed-900': '#066042',
        },
        Warning: {
          'Background-100': '#FFF8EB',
          'Default-700': '#B25E09',
          'Hover-800': '#96530F',
          'Pressed-900': '#80460D',
        },
        Danger: {
          'Background-100': '#FEF1F2',
          'Default-700': '#E02D3C',
          'Hover-800': '#BA2532',
          'Pressed-900': '#981B25',
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
        '.bold-22': {
          fontFamily: 'PretendardVariable',
          fontSize: '22px',
          fontWeight: '700',
          lineHeight: '1.5',
          letterSpacing: '-0.02em',
        },
        '.bold-18': {
          fontFamily: 'PretendardVariable',
          fontSize: '18px',
          fontWeight: '700',
          lineHeight: '1.5',
          letterSpacing: '-0.02em',
        },
        '.bold-16': {
          fontFamily: 'PretendardVariable',
          fontSize: '16px',
          fontWeight: '700',
          lineHeight: '1.5',
          letterSpacing: '-0.02em',
        },
        '.semibold-15': {
          fontFamily: 'PretendardVariable',
          fontSize: '15px',
          fontWeight: '600',
          lineHeight: '1.5',
          letterSpacing: '-0.02em',
        },
        '.regular-15': {
          fontFamily: 'PretendardVariable',
          fontSize: '15px',
          fontWeight: '400',
          lineHeight: '1.5',
          letterSpacing: '-0.02em',
        },
        '.bold-14': {
          fontFamily: 'PretendardVariable',
          fontSize: '14px',
          fontWeight: '700',
          lineHeight: '1.5',
          letterSpacing: '-0.02em',
        },
        '.regular-14': {
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
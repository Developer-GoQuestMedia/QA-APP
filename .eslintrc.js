module.exports = {
  extends: ['next/core-web-vitals'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', {
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^(rotate|opacity|scale|animControls|autoResizeTextArea|checkMediaSupport|mediaRecorderRef|playbackRate|handleNext|handlePrevious|rewindFiveSeconds|changePlaybackRate|isLoadingUsers)$'
    }],
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn'
  }
}; 
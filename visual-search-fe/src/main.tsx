import React from 'react'
import ReactDOM from 'react-dom/client'

import { AppProviders } from './app/providers'
import { AppRouter } from './app/router'
import './styles/global.css'
import StyleGuideLayout from './StyleGuideLayout'
import StyleGuideBasic from './StyleGuideBasic'
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders>
      <AppRouter />
      {/* <StyleGuideLayout />
      <StyleGuideBasic /> */}
    </AppProviders>
  </React.StrictMode>,
)

import Main from './components/Main'
import React, { Component } from 'react'
import { Switch, Route } from 'react-router-dom'
import { ThemeProvider } from '@material-ui/styles'
import { createMuiTheme } from '@material-ui/core/styles'
import './App.css'

/**
 * Create custom theme for Material UI
 * palette: specifies the main colors of the application
 * themeName: the name of the theme
 */
const palette = {
  primary: { main: '#1B5E20', light: '#4C8C4A', dark: '#003300' },
  secondary: { main: '#FFAB40', light: '#FFDD71', dark: '#C77C02' },
}

const themeName = 'Custom theme'

const theme = createMuiTheme({
  palette,
  themeName,
  overrides: {
    MuiListItem: {
      root: {
        '&$selected': {
          'background-color': palette.primary.light,
        },
      },
    },
    MuiTab: {
      textColorInherit: {
        '&$selected': {
          'background-color': palette.secondary.main,
        },
      },
    },
  },
})

/**
 * App is the main component. It renders all application routes which
 * correspond to different application windows.
 * Its state keeps high level information
 */

const App = () => (
  <ThemeProvider theme={theme}>
    <Switch>
      <Route
        path="/"
        render={() => (
          <Main
            electron={window.require('electron')}
            isDev={window.require('electron-is-dev')}
          />
        )}
      />
    </Switch>
  </ThemeProvider>
)

export default App

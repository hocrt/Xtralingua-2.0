// Module to control application life (app)
// Module to create browser's windows (BrowserWindow)
// Module to modify the menu bar and (Menu)
// Module for interprocess communication (ipcMain)
import { app, BrowserWindow, Menu, ipcMain } from 'electron'
// Package to determine run mode
import isDev from 'electron-is-dev'
import settings, { set } from 'electron-settings'
// Package to connect to database
import fs from 'fs'
import Schemas from '@xlng/resources'
import LinvoDB from 'linvodb3'
import _ from 'lodash'
LinvoDB.dbPath = `${process.cwd()}/db`

class XtralinguaApp {
  constructor() {
    this.firstTime

    // Keep a global reference of the window objects, if you don't, the windows will
    // be closed automatically when the JavaScript object is garbage collected.
    this.mainWindow
    this.settingsWindow
  }

  async init(paramObj) {
    console.log('Connection successful')
    this.initalizeModels()
    this.createMainWindow(paramObj)
    if (this.firstTime) {
      await new Promise((resolve, _reject) => {
        fs.readFile(
          `${__dirname}/../src/resources/indices/indices.json`,
          'utf8',
          (err, jsonString) => {
            if (err) {
              console.log('File read failed:', err)
              return
            }
            this.Indices.insert(JSON.parse(jsonString), resolve)
          }
        )
      })
    }
  }

  createMainWindow(paramObj) {
    let menu = Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [
          { type: 'separator' },
          {
            label: 'Settings',
            click: () => {
              this.mainWindow.webContents.send('open-settings')
            },
          },
          {
            label: 'Toggle Dev Tools',
            click: () => {
              this.mainWindow.webContents.toggleDevTools()
            },
            accelerator: 'CmdOrCtrl+Shift+I',
          },
          {
            type: 'separator',
          },
          {
            label: 'Exit',
            role: 'quit',
            accelerator: 'CmdOrCtrl+Q',
          },
        ],
      },
    ])
    Menu.setApplicationMenu(menu)

    const { width, height, x, y } = paramObj

    // Create the browser window.
    this.mainWindow = new BrowserWindow({
      width: width,
      height: height,
      x: x,
      y: y,
      webPreferences: {
        enableRemoteModule: true,
        nodeIntegration: true,
      },
    })
    // and load the index.html of the app.
    this.mainWindow.loadURL(
      isDev
        ? 'http://localhost:3000/'
        : `file://${__dirname}/../build/index.html`
    )
    if (isDev) {
      // Open the DevTools.
      this.mainWindow.webContents.toggleDevTools()
    }

    // Store the window dimensions on resize to use them on the next execution of the tool
    this.mainWindow.on('resize', () => {
      let { width, height } = this.mainWindow.getBounds()
      settings.set('windowBounds', { width, height })
    })

    // Store the window position on move to use them on the next execution of the tool
    this.mainWindow.on('move', () => {
      let [x, y] = this.mainWindow.getPosition()
      settings.set('windowPosition', { x: x, y: y })
    })

    // Set window to null when the window is closed.
    this.mainWindow.on('closed', () => {
      // Dereference the window object, usually you would store windows
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element.
      this.mainWindow = null
    })
  }

  initalizeModels() {
    this.Corpus = new LinvoDB('corpus', Schemas.corpusSchema)
    this.Indices = new LinvoDB('indices', Schemas.corpusSchema)
    this.Script = new LinvoDB('script', Schemas.corpusSchema)
  }
}

function setHandlers(app) {
  /* Create a channel between main and rendered process
   * for book insertion
   */
  ipcMain.on('add-results', (event, parameters) => {
    // Read data from certain json file
    fs.readFile(
      `temp\\results_${parameters.resultType}.json`,
      'utf8',
      (err, jsonString) => {
        if (err) {
          console.log('File read failed:', err)
          return
        }
        let data = JSON.parse(jsonString)

        // Save books metadata from data obj in order to use remaining fields as database fields
        const booksNum = data.filePaths.length
        const filePaths = data.filePaths
        delete data.filePaths
        // Update or insert database with new data
        const operations = filePaths.map((filePath, index) => {
          let indices = {}
          // Replace '.' with '_' in index names in order to avoid problem with
          // MongoDB indices retrieval
          Object.keys(data).forEach((key) => {
            // Check for indices that store objects (readability, lexdiv, misc etc)
            if (data[key][index].length === undefined) {
              let indicesObject = {}
              Object.keys(data[key][index]).forEach((indexName) => {
                indicesObject[indexName.replace(/[.]/g, '_')] =
                  data[key][index][indexName]
              })
              data[key][index] = indicesObject
            }
            indices[`indices.${key}`] = data[key][index]
          })

          return new Promise((resolve, _reject) => {
            app.Corpus.update(
              { path: filePath },
              { $set: indices },
              { upsert: true },
              (_err, numReplaced) => {
                resolve(numReplaced)
              }
            )
          })
        })
        Promise.all(operations).then((res) => {
          event.returnValue = {
            upsertedCount: res.reduce((a, b) => a + b, 0),
          }
        })
      }
    )
  })

  /* Create a channel between main and rendered process
   * for result search and return.
   * Returns every user specified fields (null for missing fields)
   */
  ipcMain.on('get-results', (event, parameters) => {
    let direction = parameters.order.asc ? 1 : -1
    let projectionArray = [
      'name',
      'path',
      'indices.tokensNum',
      'indices.vocabularyNum',
    ]
    Object.keys(parameters.indices).forEach((indexType) =>
      parameters.indices[indexType].map((indexName) => {
        projectionArray.push(
          `indices.${indexType}.${indexName.replace(/[.]/g, '_')}`
        )
      })
    )

    app.Corpus.find({
      path: {
        $in: parameters.filePaths,
      },
    })
      .map((x) => _.pick(x, projectionArray))
      .sort({
        [parameters.order.by]: direction,
      })
      .exec((_err, docs) => {
        event.reply('receive-results', docs)
      })
  })

  /* Create a channel between main and rendered process
   * for tokens or vocabulary return.
   * Returns an array of strings
   */
  ipcMain.on('get-wordList', (event, parameters) => {
    let projection = {
      name: 1,
      [`indices.${parameters.wordListType}`]: 1,
      _id: 0,
    }
    app.Corpus.find({ path: parameters.filePath })
      .map((x) => _.pick(x, ['name', `indices.${parameters.wordListType}`]))
      .exec((err, result) => {
        event.returnValue = result
      })
  })

  /* Create a channel between main and rendered process
   * for book retrieval
   */
  ipcMain.on('get-book', (event, parameters) => {
    let direction = parameters.order.asc ? 1 : -1
    let projection = {
      name: 1,
      path: 1,
      size: 1,
      _id: 0,
    }
    app.Corpus.find({})
      .map((doc) => ({
        path: doc.path,
        name: doc.name,
        size: doc.size,
      }))
      .sort({
        [parameters.order.by]: direction,
      })
      .exec((_err, docs) => {
        event.reply('receive-book', docs)
      })
  })

  /* Create a channel between main and rendered process
   * for custom script insertion.
   */
  ipcMain.on('add-script', (event, parameters) => {
    app.Script.update(
      { name: parameters.name },
      {
        $set: {
          name: parameters.name,
          env: parameters.env,
          path: parameters.path,
          args: parameters.args,
        },
      },
      {
        upsert: true,
      },
      (_err, res) => {
        event.returnValue = res
      }
    )
  })

  /* Create a channel between main and rendered process
   * for custom script deletion.
   */
  ipcMain.on('delete-script', (event, parameters) => {
    app.Script.remove({ name: parameters.name }, {}, (err) => {
      if (err) throw new Error(err)
      event.returnValue = 'done'
    })
  })

  /* Create a channel between main and rendered process
   * to fetch custom scripts.
   */
  ipcMain.on('get-script', (event) => {
    app.Script.find({}, (_err, result) => {
      event.reply('receive-script', result)
    })
  })

  /* Create a channel between main and rendered process
   * for book insertion.
   */
  ipcMain.on('add-book', (event, parameters) => {
    const operations = parameters.filePaths.map((filePath, index) => ({
      updateOne: {
        filter: { path: filePath },
        upsert: true,
        update: {
          name: parameters.fileNames[index],
          path: parameters.filePaths[index],
          size: parameters.size[index],
          lastModified: parameters.lastModified[index],
        },
      },
    }))

    const newDocArray = parameters.filePaths.map((_path, idx) => ({
      name: parameters.fileNames[idx],
      path: parameters.filePaths[idx],
      size: parameters.size[idx],
      lastModified: parameters.lastModified[idx],
    }))

    Promise.all(
      newDocArray.map(
        (doc) =>
          new Promise((resolve, reject) => {
            console.log(doc)
            app.Corpus.update(
              { path: doc.path },
              { $set: doc },
              { upsert: true },
              (_err, numReplaced) => {
                resolve(numReplaced)
              }
            )
          })
      )
    ).then((res) => {
      app.Corpus.find({}, (e, docs) => {
        console.log(docs)
        event.returnValue = {
          upsertedCount: res.reduce((a, b) => a + b, 0),
        }
      })
    })
  })
  /* Create a channel between main and rendered process
   * for book deletion.
   */
  ipcMain.on('delete-book', (event, parameters) => {
    app.Corpus.remove({ path: parameters.path }, {}, (err) => {
      if (err) {
        throw new Error(err)
      }
      event.returnValue = 'done'
    })
  })

  /* Create a channel between main and rendered process
   * to fetch indices based on their type.
   */
  ipcMain.on('get-indices', (event) => {
    app.Indices.find({}, (error, result) => {
      // Send found indices through main - renderer channel
      event.reply('receive-indices', result)
    })
  })
}

// createSettingsWindow = () => {
//   if (settingsWindow) return;

//   settingsWindow = new BrowserWindow({
//     title: "Settings",
//     resizable: false,
//     width: 600,
//     height: 460,
//     backgournd: "#f3f3f3",
//     webPreferences: {
//       nodeIntegration: true
//     }
//   });

//   // and load the html using the appropriate path
//   settingsWindow.loadURL(isDev ? 'http://localhost:3000/settings' : /*TODO ??????????????????????*/ `file://${path.join(__dirname, 'index.html')}`);
//   if (isDev) {
//     // Open the DevTools.
//     //BrowserWindow.addDevToolsExtension('<location to your react chrome extension>');
//     settingsWindow.webContents.openDevTools();
//   }
//   settingsWindow.on('closed', function () {
//     settingsWindow = null;
//   });

// };

const xlngApp = new XtralinguaApp()

/* When the Electron has finished initializastion create main window with
 * window position and dimensions as determined in last execution
 */

app.on('ready', async () => {
  let { width, height } = settings.get('windowBounds', {
    width: 1024,
    height: 800,
  })
  let { x, y } = settings.get('windowPosition', { x: 40, y: 60 })
  await xlngApp.init({
    width: width,
    height: height,
    x: x,
    y: y,
  })
  setHandlers(xlngApp)
})

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (settings.get('firstTime')) {
    settings.set('firstTime', false)
  }
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (xlngApp.mainWindow === null) xlngApp.createMainWindow()
})

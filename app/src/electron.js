import path from 'path'
// Module to control application life (app)
// Module to create browser's windows (BrowserWindow)
// Module to modify the menu bar and (Menu)
// Module for interprocess communication (ipcMain)
import { app, BrowserWindow, Menu, ipcMain } from 'electron'
// Package to determine run mode
import isDev from 'electron-is-dev'
import settings, { set } from 'electron-settings'
// Package to connect to database
import * as mongoose from 'mongoose'
import fs from 'fs'
import Schemas from './resources'
import LinvoDB from 'linvodb3'
import { inspect } from 'util'

class XtralinguaApp {
  constructor() {
    this.firstTime

    // Keep a global reference of the window objects, if you don't, the windows will
    // be closed automatically when the JavaScript object is garbage collected.
    this.mainWindow
    this.settingsWindow
  }

  async init(paramObj) {
    this.firstTime = settings.get('firstTime', true)
    console.log(this.firstTime)
    let connection = await this.connectToDatabase()
    if (!connection) {
      throw new Error("Couldn't connect to database")
    }
    console.log('Connection successful')
    this.initalizeModels()
    this.createMainWindow(paramObj)
    if (this.firstTime) {
      fs.readFile(
        'src/resources/indices/indices.json',
        'utf8',
        (err, jsonString) => {
          if (err) {
            console.log('File read failed:', err)
            return
          }
          this.Indices.insertMany(JSON.parse(jsonString))
        }
      )
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
            click() {
              this.mainWindow.webContents.send('open-settings')
            },
          },
          {
            label: 'Toggle Dev Tools',
            click() {
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
        : `file://${path.join(__dirname, '../build/index.html')}`
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

  async connectToDatabase() {
    try {
      console.log('Connecting to the DB... ')

      const connection = await mongoose.connect(
        `mongodb://localhost:27017/text_extraction_db`,
        {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          useFindAndModify: false,
          useCreateIndex: true,
        }
      )

      console.log('Connections established: ' + connection)

      return connection
    } catch (error) {
      throw Error(`Unable to connect to DB :: ${error}`)
    }
  }

  initalizeModels() {
    this.Corpus = mongoose.model('corpus', Schemas.corpusSchema)
    this.Indices = mongoose.model('indices', Schemas.indicesSchema)
    this.Script = mongoose.model('script', Schemas.scriptSchema)
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

          return {
            updateOne: {
              filter: { path: filePath },
              upsert: true,
              update: {
                $set: indices,
              },
            },
          }
        })
        console.log(operations)
        app.Corpus.bulkWrite(
          operations,
          (error, res) => (event.returnValue = res)
        )
      }
    )
  })

  /* Create a channel between main and rendered process
   * for result search and return.
   * Returns every user specified fields (null for missing fields)
   */
  ipcMain.on('get-results', (event, parameters) => {
    let direction = parameters.order.asc ? 1 : -1
    let projection = {
      name: 1,
      path: 1,
      'indices.tokensNum': 1,
      'indices.vocabularyNum': 1,
      _id: 0,
    }
    Object.keys(parameters.indices).forEach((indexType) =>
      parameters.indices[indexType].map(
        (indexName) =>
          (projection[
            `indices.${indexType}.${indexName.replace(/[.]/g, '_')}`
          ] = [`$indices.${indexType}.${indexName.replace(/[.]/g, '_')}`])
      )
    )
    app.Corpus.aggregate(
      [
        {
          $match: {
            path: {
              $in: parameters.filePaths,
            },
          },
        },
        {
          $project: projection,
        },
        {
          $sort: {
            [parameters.order.by]: direction,
          },
        },
      ],
      (e, result) => {
        result.forEach((resultObj) =>
          Object.keys(parameters.indices).forEach((indexType) =>
            parameters.indices[indexType].forEach(
              (indexName) =>
                (resultObj['indices'][indexType][
                  indexName.replace(/[.]/g, '_')
                ] =
                  resultObj['indices'][indexType][
                    indexName.replace(/[.]/g, '_')
                  ][0])
            )
          )
        )
        // Send returned data through main - renderer channel
        event.reply('receive-results', result)
      }
    )
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
    app.Corpus.aggregate(
      [
        {
          $match: {
            path: parameters.filePath,
          },
        },
        {
          $project: projection,
        },
      ],
      (e, result) => {
        // Send returned data through main - renderer channel
        event.returnValue = result
      }
    )
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
    app.Corpus.aggregate(
      [
        {
          $project: projection,
        },
        {
          $sort: {
            [parameters.order.by]: direction,
          },
        },
      ],
      (e, result) => {
        // Send returned data through main - renderer channel
        event.reply('receive-book', result)
      }
    )
  })

  /* Create a channel between main and rendered process
   * for custom script insertion.
   */
  ipcMain.on('add-script', (event, parameters) => {
    app.Script.updateOne(
      { name: parameters.name },
      {
        name: parameters.name,
        env: parameters.env,
        path: parameters.path,
        args: parameters.args,
      },
      {
        upsert: true,
      },
      (error, res) => (event.returnValue = res)
    )
  })

  /* Create a channel between main and rendered process
   * for custom script deletion.
   */
  ipcMain.on('delete-script', (event, parameters) => {
    app.Script.deleteOne({ name: parameters.name }, (err) => {
      if (err) throw new Error(err)
      event.returnValue = 'done'
    })
  })

  /* Create a channel between main and rendered process
   * to fetch custom scripts.
   */
  ipcMain.on('get-script', (event) => {
    app.Script.find({}, (error, result) => {
      // Send found indices through main - renderer channel
      event.reply(
        'receive-script',
        result.map((obj) => obj.toObject({ versionKey: false }))
      )
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
    app.Corpus.bulkWrite(operations, (error, res) => {
      console.log(typeof res)
      event.returnValue = res
    })
  })
  /* Create a channel between main and rendered process
   * for book deletion.
   */
  ipcMain.on('delete-book', (event, parameters) => {
    app.Corpus.deleteOne({ path: parameters.path }, (err) => {
      if (err) throw new Error(err)
      event.returnValue = 'done'
    })
  })

  /* Create a channel between main and rendered process
   * to fetch indices based on their type.
   */
  ipcMain.on('get-indices', (event) => {
    app.Indices.find({}, (error, result) => {
      // Send found indices through main - renderer channel
      event.reply(
        'receive-indices',
        result.map((doc) => doc.toObject({ versionKey: false }))
      )
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

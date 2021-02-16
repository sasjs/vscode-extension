# Visual Studio Code Extension for SASjs

This project contains the source code for the SASjs VS Code extension.

## Features

### Execute code on your SAS server

You can run the `SASjs: Execute Code` command from the command palette(`Cmd+Shift+P`) to execute code from the currently open file against a specified server.

The extension uses the global SASjs configuration located at `~/.sasjsrc` to identify available server targets. If there are none available, it will prompt you to create one.

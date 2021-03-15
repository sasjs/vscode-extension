# Visual Studio Code Extension for SASjs

This project contains the source code for the SASjs VS Code extension, available in the following locations:

* Visual Studio Code Marketplace (suitable for VS Code):  https://marketplace.visualstudio.com/items?itemName=SASjs.sasjs-for-vscode
* Open VSX (Suitable for VSCodium and Theia): https://open-vsx.org/extension/sasjs/sasjs-for-vscode

## Features


### Execute code on SAS Viya

When a SAS program is selected, you can click the running man icon to execute that code on SAS Viya.  

![snippet](https://user-images.githubusercontent.com/4420615/111214809-aacb2b00-85d2-11eb-95ab-8832c9d13afb.gif)

The first time you do this, you will [receive a series of prompts](https://youtu.be/lNWS2lCRX4I):

 - Name of Target.  This is an alias relating to the server on which you intend to run the code.  It will be added as a GLOBAL target, located at `~/.sasjsrc`. More info [here](https://cli.sasjs.io/faq/#what-is-the-difference-between-local-and-global-targets)).
 - Server Url.  The full URL (including port if needed) of your SAS Viya server.
 - Server Type.  Currenly only SAS Viya is supported.
 - CLIENT / SECRET.  You will need to ask your administrator for these, and they should have the `authorization_code` grant type.  More info [here](https://cli.sasjs.io/faq/#how-can-i-obtain-a-viya-client-and-secret).
 - Select default.  Click 'yes' to avoid having to select your target each time.

You can now execute code!  You can also highlight a section of code and run that. Each log returned will be stored in a `sasjsresults` folder.  You can also run the `SASjs: Execute Code` command from the command palette(`Cmd+Shift+P`).

### Syntax Highlighting

Two themes are provided with SAS Code formatting - a Light Theme and a Dark Theme

![](https://i.imgur.com/dbCD6rg.png)![](https://i.imgur.com/BrPmat4.png)

## Contributions

SASjs is an open source project, and contributions are warmly welcomed!

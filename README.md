# Visual Studio Code Extension for SASjs
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-7-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

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

### SAS Lint and Format
Spend less time on code reviews and more time pushing code! Select VIEW->PROBLEMS (or ctrl+shift+M) to examine the currently opened SAS program for issues.

![image](https://user-images.githubusercontent.com/4420615/113478713-800e1d00-9482-11eb-90c1-10a80a41be1a.png)

Rules can be configured by creating a `.sasjslint` file in the root of your project as follows:

```json
{
    "noTrailingSpaces": true,
    "noEncodedPasswords": true,
    "hasDoxygenHeader": true,
    "noSpacesInFileNames": true,
    "maxLineLength": 80,
    "lowerCaseFileNames": true,
    "noTabIndentation": true,
    "indentationMultiple": 2
}
```

We've now added the ability to automatically fix certain problems within SAS files, such as trailing spaces, missing Doxygen header blocks and missing macro names in `%mend` statements.
You can use this feature in two ways:

1. On demand - by selecting 'Format Document' either from the right click menu or from the command palette.
![format](https://user-images.githubusercontent.com/2980428/117260252-c9b5a300-ae46-11eb-9e7e-f70b9166fbbe.gif)

2. By enabling automatic formatting of files on save/paste from the Settings menu.
![image](https://user-images.githubusercontent.com/2980428/117259572-15b41800-ae46-11eb-9c7f-b9700b77405b.png)


### Syntax Highlighting

Two themes are provided with SAS Code formatting - a Light Theme and a Dark Theme

![](https://i.imgur.com/dbCD6rg.png)![](https://i.imgur.com/BrPmat4.png)

## Contributions

SASjs is an open source project, and contributions are warmly welcomed!

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/allanbowe"><img src="https://avatars.githubusercontent.com/u/4420615?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Allan Bowe</b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=allanbowe" title="Code">💻</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=allanbowe" title="Tests">⚠️</a> <a href="https://github.com/sasjs/vscode-extension/pulls?q=is%3Apr+reviewed-by%3Aallanbowe" title="Reviewed Pull Requests">👀</a> <a href="#video-allanbowe" title="Videos">📹</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=allanbowe" title="Documentation">📖</a></td>
    <td align="center"><a href="https://www.erudicat.com/"><img src="https://avatars.githubusercontent.com/u/25773492?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Yury Shkoda</b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=YuryShkoda" title="Code">💻</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=YuryShkoda" title="Tests">⚠️</a> <a href="#projectManagement-YuryShkoda" title="Project Management">📆</a> <a href="#video-YuryShkoda" title="Videos">📹</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=YuryShkoda" title="Documentation">📖</a></td>
    <td align="center"><a href="https://krishna-acondy.io/"><img src="https://avatars.githubusercontent.com/u/2980428?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Krishna Acondy</b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=krishna-acondy" title="Code">💻</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=krishna-acondy" title="Tests">⚠️</a> <a href="https://github.com/sasjs/vscode-extension/pulls?q=is%3Apr+reviewed-by%3Akrishna-acondy" title="Reviewed Pull Requests">👀</a> <a href="#infra-krishna-acondy" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#platform-krishna-acondy" title="Packaging/porting to new platform">📦</a> <a href="#maintenance-krishna-acondy" title="Maintenance">🚧</a> <a href="#content-krishna-acondy" title="Content">🖋</a></td>
    <td align="center"><a href="https://github.com/saadjutt01"><img src="https://avatars.githubusercontent.com/u/8914650?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Muhammad Saad </b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=saadjutt01" title="Code">💻</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=saadjutt01" title="Tests">⚠️</a> <a href="https://github.com/sasjs/vscode-extension/pulls?q=is%3Apr+reviewed-by%3Asaadjutt01" title="Reviewed Pull Requests">👀</a> <a href="#mentoring-saadjutt01" title="Mentoring">🧑‍🏫</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=saadjutt01" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/sabhas"><img src="https://avatars.githubusercontent.com/u/82647447?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Sabir Hassan</b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=sabhas" title="Code">💻</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=sabhas" title="Tests">⚠️</a> <a href="https://github.com/sasjs/vscode-extension/pulls?q=is%3Apr+reviewed-by%3Asabhas" title="Reviewed Pull Requests">👀</a> <a href="#ideas-sabhas" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://github.com/medjedovicm"><img src="https://avatars.githubusercontent.com/u/18329105?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Mihajlo Medjedovic</b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=medjedovicm" title="Code">💻</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=medjedovicm" title="Tests">⚠️</a> <a href="https://github.com/sasjs/vscode-extension/pulls?q=is%3Apr+reviewed-by%3Amedjedovicm" title="Reviewed Pull Requests">👀</a> <a href="#infra-medjedovicm" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
    <td align="center"><a href="https://github.com/VladislavParhomchik"><img src="https://avatars.githubusercontent.com/u/83717836?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Vladislav Parhomchik</b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=VladislavParhomchik" title="Tests">⚠️</a> <a href="https://github.com/sasjs/vscode-extension/pulls?q=is%3Apr+reviewed-by%3AVladislavParhomchik" title="Reviewed Pull Requests">👀</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
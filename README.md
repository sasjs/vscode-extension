# Visual Studio Code Extension for SASjs
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-8-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

The SASjs VS Code extension is **only available on Open VSX**:  https://open-vsx.org/extension/sasjs/sasjs-for-vscode

If you have questions or would like support, visit [https://matrix.to/#/#sasjs:4gl.io](https://matrix.to/#/#sasjs:4gl.io).

## Features

* [Code Documentation](#code-documentation)
* [Code Execution](#code-execution)
* [Directory Synchronisation](#directory-synchronisation)
* [SAS Lint and Format](#sas-lint-and-format)
* [Compile, Build and Deploy](#compile-build-deploy)
* [Snippets for Base & SASjs Core](#snippets)

## Code Documentation

Generate HTML docs from your SAS code! Requires a local installation of [Doxygen](https://www.doxygen.nl/download.html). Video overview available [here](https://vid.4gl.io/w/7cbbpZwU9U2DNBnC5SHb7n).

Configuration is identical to the SASjs CLI, documented at [https://cli.sasjs.io/doc](https://cli.sasjs.io/doc), driven by the [docConfig](https://cli.sasjs.io/sasjsconfig.html#docConfig) object.

Given that projects may be new to SASjs (without a `sasjs/sasjsconfig.json` file) the following workflow takes place:

1. If workspace contains a `sasjs/sasjsconfig.json` file, go to Step 3
2. If any parent directories contain a `sasjs/sasjsconfig.json` file, use this target, and go to Step 4.
3. Create a workspace-level `sasjs/sasjsconfig.json` file (and doxy files), and use this as the target.
4. Generate docs using target [`docConfig.outDirectory`](https://cli.sasjs.io/sasjsconfig.html#docConfig_outDirectory) property (`sasjsbuild/docs` by default)
5. Put `index.html` in focus

To view the `index.html` as a web page, open in Firefox, or right click and view with the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension (if installed).


## Code Execution

You can run code on SAS Viya, SAS 9 EBI or [SASjs Server](https://server.sasjs.io)!  Just set up the target, and click the running man to execute your SAS code.

![snippet](https://user-images.githubusercontent.com/4420615/111214809-aacb2b00-85d2-11eb-95ab-8832c9d13afb.gif)

You can also highlight a section of code and run that. Each log returned will be stored in a `sasjsresults` folder.  You can also run the `SASjs: Execute Code` command from the command palette(`Cmd+Shift+P`).

The target 🎯 describes the server on which you intend to run the code.  The attributes are added to a file in your home directory - `~/.sasjsrc`. More info [here](https://cli.sasjs.io/faq/#what-is-the-difference-between-local-and-global-targets)).

The following attributes are needed for all server types:

 - Name.  An alias to represent the target.
 - Server Url.  The full URL (including port if needed) of your SAS server.
 - Server Type.  Can be SASVIYA, SAS9 or SASJS.

Below are the setup steps specific to each server type

#### SAS Viya

Enter the [following prompts](https://youtu.be/lNWS2lCRX4I):

 - CLIENT / SECRET.  Relevant for SASVIYA - you will need to ask your administrator for these, and they should have the `authorization_code` grant type.  More info [here](https://cli.sasjs.io/faq/#how-can-i-obtain-a-viya-client-and-secret).
 - Follow the link to obtain your authorisation code

#### SAS9 EBI

For a SAS9 server type, you need to provide your user and passsword in the prompts.  Before you can execute code, you will need a runner (an STP in your metadata home directory) - just follow the instructions here:  https://cli.sasjs.io/auth/#sasjs-runner


https://user-images.githubusercontent.com/4420615/174494256-8676a5e3-9dd2-45a7-bc67-2a5c2355c182.mp4

If you are using self-signed certificates and are unable to connect due to `Error while handling error. Unable to verify the first certificate` - but you ARE able to connect using the [sasjs cli](https://cli.sasjs.io) - then you may need to make the following adjustments:

1. Set `"http.proxySupport": "fallback"` in VS Code settings (instead of the default `"override"`)
2. Set `"rejectUnauthorized": false` in the [httpsAgentOptions](https://cli.sasjs.io/sasjsconfig.html#httpsAgentOptions_rejectUnauthorized) object in the sasjsconfig file (`sasjs/sasjsconfig.json` or `~/.sasjsrc`)


#### SASjs Server

In order to run on Foundation / Base / Desktop SAS you will need a running version of SASjs server (on the same machine where SAS is installed).  You can download SASjs server [here](https://github.com/sasjs/server/releases).  Configuration instructions are [here](https://server.sasjs.io/installation/).

For local desktop instances of SASjs Server, the serverUrl is likely to be http://localhost:5000

If you are running SASjs Server in server mode, then you will need a client id - the default is `clientID1`

## Directory Synchronisation

Sometimes when working with SAS, you would like to supply some physical content (eg macros, format definitions, Excel, images, etc) to the remote SAS server.

The [`syncDirectories`](https://cli.sasjs.io/sasjsconfig.html#syncDirectories) feature lets you map one or more LOCAL (on your laptop) directories with one or more REMOTE (on the SAS server) directories.

It works by hashing the remote files, comparing the hashes with the local files, and deploying only the changed files.  No SSH access needed, all files are deployed using 100% SAS Code.

More information is in the [cli docs](https://cli.sasjs.io/fs) and this [explanatory video](https://vid.4gl.io/w/jKf6T8FxRTAdqQXWxUt36u).

To configure, just add the `syncDirectories` [object](https://cli.sasjs.io/sasjsconfig.html#syncDirectories) to your local `sasjs/sasjsconfig.json` file.  If this file does not exist, just click the Documentation icon to create one.


## SAS Lint and Format
Spend less time on code reviews and more time pushing code! Select VIEW->PROBLEMS (or ctrl+shift+M) to examine the currently opened SAS program for issues.

![image](https://user-images.githubusercontent.com/4420615/113478713-800e1d00-9482-11eb-90c1-10a80a41be1a.png)

### Rules

Rules can be configured by creating a `.sasjslint` file in the root of your project as follows:

```json
{
    "defaultHeader": "/**{lineEnding}  some custom header{lineEnding}**/",
    "noEncodedPasswords": true,
    "hasDoxygenHeader": true,
    "hasMacroNameInMend": true,
    "hasMacroParentheses": true,
    "ignoreList": [
      "sajsbuild/",
      "sasjsresults/"
    ],
    "indentationMultiple": 2,
    "lowerCaseFileNames": true,
    "maxLineLength": 80,
    "noNestedMacros": true,
    "noSpacesInFileNames": true,
    "noTabs": true,
    "noTrailingSpaces": true
}
```

Settings in the project (workspace) root (`.sasjslint`) take the highest precedence, followed by the following locations:

* VS Code (extension) settings (`sasjs-for-vscode.lintConfig`)
* User Home directory (`~/.sasjslint`)
* Default settings (see https://github.com/sasjs/lint#sas-lint-settings)

### Formatting

SASjs lint can automatically fix certain problems within SAS files, such as trailing spaces, missing Doxygen header blocks and missing macro names in `%mend` statements.
You can use this feature in two ways:

1. On demand - by selecting 'Format Document' either from the right click menu or from the command palette.
![format](https://user-images.githubusercontent.com/2980428/117260252-c9b5a300-ae46-11eb-9e7e-f70b9166fbbe.gif)

2. By enabling automatic formatting of files on save/paste from the Settings menu.
![image](https://user-images.githubusercontent.com/2980428/117259572-15b41800-ae46-11eb-9c7f-b9700b77405b.png)

## Compile, Build and Deploy

### Single File

If a `*.sas` file is selected and a `Compile, Build, Deploy` icon is clicked, then a single file will be compiled, built and deployed. Compiled and built files will be located in `sasjsbuild` folder at the root of the project. If an error appeared during the process, `log` file should be created in `sasjsresults` folder.
![image](./assets/screenshots/cbd-single-file.png)

### Project

if a `sasjsconfig.json` file is selected and a `Compile, Build, Deploy` icon is clicked, then an entire project will be compiled, built and deployed. Compiled and built files will be located in `sasjsbuild` folder at the root of the project. If an error appeared during the process, `log` file should be created in `sasjsresults` folder.
![image](./assets/screenshots/cbd-project.png)


## Snippets

Snippets (code-completion) are provided both for Base SAS (using the [official SAS VS Code Extension](https://github.com/sassoftware/vscode-sas-extension) files) and [SASjs Core](https://core.sasjs.io) (using the [snippets generator](https://cli.sasjs.io/snippets) of the SASjs CLI). To use snippets, just start typing SAS macro name, eg:

![image](./assets/screenshots/vscode-snippets.png)

NOTE: If you don't see a snippet description, you might need to click the `Read More` icon, and snippet description will appear for all snippets, eg:

![image](./assets/screenshots/vscode-snippets-read-more.png)

## Contributions

SASjs is an open source project, and contributions are warmly welcomed!

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/allanbowe"><img src="https://avatars.githubusercontent.com/u/4420615?v=4?s=100" width="100px;" alt="Allan Bowe"/><br /><sub><b>Allan Bowe</b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=allanbowe" title="Code">💻</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=allanbowe" title="Tests">⚠️</a> <a href="https://github.com/sasjs/vscode-extension/pulls?q=is%3Apr+reviewed-by%3Aallanbowe" title="Reviewed Pull Requests">👀</a> <a href="#video-allanbowe" title="Videos">📹</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=allanbowe" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.erudicat.com/"><img src="https://avatars.githubusercontent.com/u/25773492?v=4?s=100" width="100px;" alt="Yury Shkoda"/><br /><sub><b>Yury Shkoda</b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=YuryShkoda" title="Code">💻</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=YuryShkoda" title="Tests">⚠️</a> <a href="#projectManagement-YuryShkoda" title="Project Management">📆</a> <a href="#video-YuryShkoda" title="Videos">📹</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=YuryShkoda" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://krishna-acondy.io/"><img src="https://avatars.githubusercontent.com/u/2980428?v=4?s=100" width="100px;" alt="Krishna Acondy"/><br /><sub><b>Krishna Acondy</b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=krishna-acondy" title="Code">💻</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=krishna-acondy" title="Tests">⚠️</a> <a href="https://github.com/sasjs/vscode-extension/pulls?q=is%3Apr+reviewed-by%3Akrishna-acondy" title="Reviewed Pull Requests">👀</a> <a href="#infra-krishna-acondy" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#platform-krishna-acondy" title="Packaging/porting to new platform">📦</a> <a href="#maintenance-krishna-acondy" title="Maintenance">🚧</a> <a href="#content-krishna-acondy" title="Content">🖋</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/saadjutt01"><img src="https://avatars.githubusercontent.com/u/8914650?v=4?s=100" width="100px;" alt="Muhammad Saad "/><br /><sub><b>Muhammad Saad </b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=saadjutt01" title="Code">💻</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=saadjutt01" title="Tests">⚠️</a> <a href="https://github.com/sasjs/vscode-extension/pulls?q=is%3Apr+reviewed-by%3Asaadjutt01" title="Reviewed Pull Requests">👀</a> <a href="#mentoring-saadjutt01" title="Mentoring">🧑‍🏫</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=saadjutt01" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/sabhas"><img src="https://avatars.githubusercontent.com/u/82647447?v=4?s=100" width="100px;" alt="Sabir Hassan"/><br /><sub><b>Sabir Hassan</b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=sabhas" title="Code">💻</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=sabhas" title="Tests">⚠️</a> <a href="https://github.com/sasjs/vscode-extension/pulls?q=is%3Apr+reviewed-by%3Asabhas" title="Reviewed Pull Requests">👀</a> <a href="#ideas-sabhas" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/medjedovicm"><img src="https://avatars.githubusercontent.com/u/18329105?v=4?s=100" width="100px;" alt="Mihajlo Medjedovic"/><br /><sub><b>Mihajlo Medjedovic</b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=medjedovicm" title="Code">💻</a> <a href="https://github.com/sasjs/vscode-extension/commits?author=medjedovicm" title="Tests">⚠️</a> <a href="https://github.com/sasjs/vscode-extension/pulls?q=is%3Apr+reviewed-by%3Amedjedovicm" title="Reviewed Pull Requests">👀</a> <a href="#infra-medjedovicm" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/VladislavParhomchik"><img src="https://avatars.githubusercontent.com/u/83717836?v=4?s=100" width="100px;" alt="Vladislav Parhomchik"/><br /><sub><b>Vladislav Parhomchik</b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=VladislavParhomchik" title="Tests">⚠️</a> <a href="https://github.com/sasjs/vscode-extension/pulls?q=is%3Apr+reviewed-by%3AVladislavParhomchik" title="Reviewed Pull Requests">👀</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://www.linkedin.com/mwlite/in/sam-svetlichnyy-77b9971a6"><img src="https://avatars.githubusercontent.com/u/64905854?v=4?s=100" width="100px;" alt="SamSvet"/><br /><sub><b>SamSvet</b></sub></a><br /><a href="https://github.com/sasjs/vscode-extension/commits?author=SamSvet" title="Documentation">📖</a> <a href="#userTesting-SamSvet" title="User Testing">📓</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

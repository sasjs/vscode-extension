SAS function snippets

The file sas-function-snippets.json is adapted from snippets/function-snippets.json in SAS Institute Inc.'s vscode-sas-extension repository at commit 4adcfe1469e448eb28d0961be09d03cd120d4464. The local modifications add missing closing parentheses to allperm and cos, and correct the fourth compound argument's snippet placeholder:
https://github.com/sassoftware/vscode-sas-extension/blob/4adcfe1469e448eb28d0961be09d03cd120d4464/snippets/function-snippets.json

The vendored function library tracks the historical revision above; it is not fetched or updated by the setup script. Upstream deleted that file in commit c76adcf1775b42469d03f26a3146ff2a7fe62335. The separate setup fetch pinned to 97892fea1c3e909b12ae25aa50dfd22fa91d9c17 supplies the PROC snippets, not the vendored functions.

The source project is licensed under Apache License 2.0. A copy of the license is provided in LICENSE-sas-function-snippets.txt. These snippets are separate from the SASjs project's MIT-licensed code.

import { window, OutputChannel } from 'vscode'

class SASjsChannel {
  private static outputChannel: OutputChannel

  public static getOutputChannel(): OutputChannel {
    if (!SASjsChannel.outputChannel) {
      SASjsChannel.outputChannel = window.createOutputChannel('SASjs')
    }

    return SASjsChannel.outputChannel
  }
}

export default SASjsChannel

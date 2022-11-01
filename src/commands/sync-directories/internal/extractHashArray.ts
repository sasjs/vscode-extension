export const extractHashArray = (log: string) => {
  if (log.includes('>>weboutBEGIN<<')) {
    try {
      const webout = log
        .split(/>>weboutBEGIN<<\n/)[1]
        .split(/>>weboutEND<<\n/)[0]
      const jsonWebout = JSON.parse(webout)
      return jsonWebout.hashes
    } catch (err: any) {
      throw new Error(
        `An error occurred while extracting hashes array from webout: ${err.message}`
      )
    }
  }
}

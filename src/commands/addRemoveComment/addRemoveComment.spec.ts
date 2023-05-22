import { AddRemoveCommentCommand } from './addRemoveComment'
import { MockedActiveEditor } from '../../types/spec/activeEditor'
import { asyncForEach } from '@sasjs/utils'

describe('AddRemoveCommentCommand', () => {
  const context = {} as any

  const commentOutLineCommand = new AddRemoveCommentCommand(context)

  describe('isWrappedWithComments', () => {
    const isWrappedWithComments = (line: string) =>
      commentOutLineCommand['isWrappedWithComments'](line)

    it('should return false if an empty string provided', () => {
      expect(isWrappedWithComments('')).toEqual(false)
    })

    it('should return false if string is partially wrapped with comment', () => {
      expect(isWrappedWithComments('/* ')).toEqual(false)
      expect(isWrappedWithComments('*/')).toEqual(false)
      expect(isWrappedWithComments('test */ test')).toEqual(false)
    })

    it('should return true if string is wrapped with comment', () => {
      expect(isWrappedWithComments('/* */')).toEqual(true)
      expect(isWrappedWithComments('/**/')).toEqual(true)
      expect(isWrappedWithComments('/*test;*/')).toEqual(true)
      expect(isWrappedWithComments('/* test; */')).toEqual(true)
    })
  })

  describe('addRemoveCommentToLine', () => {
    const addRemoveCommentToLine = (line: string) =>
      commentOutLineCommand['addRemoveCommentToLine'](line)
    const testLine = 'test;'
    const wrappedLine = `/* ${testLine} */`

    it('should wrap a line with comments', () => {
      expect(addRemoveCommentToLine(testLine)).toEqual(wrappedLine)
    })

    it('should remove comments', () => {
      expect(addRemoveCommentToLine(wrappedLine)).toEqual(testLine)
    })
  })

  describe('addRemoveComment', () => {
    const addRemoveComment = (activeEditor?: MockedActiveEditor) =>
      commentOutLineCommand['addRemoveComment'](activeEditor)

    const getMockedActiveEditor = (
      text: string,
      lineStart = 0,
      lineEnd = 1
    ): MockedActiveEditor => ({
      document: { getText: () => text },
      selection: { start: { line: lineStart }, end: { line: lineEnd } },
      edit: () => {}
    })

    const testTexts = [
      { notCommented: ``, commented: `/*  */` },
      { notCommented: ` `, commented: `/*   */` },
      { notCommented: `test;`, commented: `/* test; */` },
      {
        notCommented: `test='some;semicolon';`,
        commented: `/* test='some;semicolon'; */`
      },
      {
        notCommented: `/* test;`,
        commented: `/* test; */`,
        uncommented: `test;`
      },
      {
        notCommented: `test; */`,
        commented: `/* test; */`,
        uncommented: `test;`
      },
      {
        notCommented: `* test;`,
        commented: `/* * test; */`
      },

      {
        notCommented: `   * test;`,
        commented: `/*    * test; */`
      },
      {
        notCommented: `//`,
        commented: `/* // */`
      },
      {
        notCommented: `///`,
        commented: `/* /// */`
      },
      {
        notCommented: `"/* comment string */"`,
        commented: `/* "/* comment string */" */`
      },
      {
        notCommented: `data _null_;
file _webout;
put 'WEBOUT content for the demo';
run;
options ls=100 ps=max;
title 'sashelp.fish';
proc print data=sashelp.fish;run;
test='some;semicolon';`,
        commented: `/* data _null_; */
/* file _webout; */
/* put 'WEBOUT content for the demo'; */
/* run; */
/* options ls=100 ps=max; */
/* title 'sashelp.fish'; */
/* proc print data=sashelp.fish;run; */
/* test='some;semicolon'; */`,
        end: 8
      },
      {
        notCommented: `data _null_;
          file _webout;
          put 'WEBOUT content for the demo';
          run;
          options ls=100 ps=max;
          title 'sashelp.fish';
          proc print data=sashelp.fish;run;
          test='some;semicolon';`,
        commented: `/* data _null_; */
/*           file _webout; */
/*           put 'WEBOUT content for the demo'; */
/*           run; */
/*           options ls=100 ps=max; */
/*           title 'sashelp.fish'; */
/*           proc print data=sashelp.fish;run; */
/*           test='some;semicolon'; */`,
        end: 8
      },
      {
        notCommented: `data _null_;
          file _webout;
`,
        commented: `/* data _null_; */
/*           file _webout; */
/*  */`,
        end: 3
      },
      {
        notCommented: `/**
  @file
  @brief <Your brief here>
  <h4> SAS Macros </h4>
**/`,
        commented: `/* * */
/*   @file */
/*   @brief <Your brief here> */
/*   <h4> SAS Macros </h4> */
/* * */`,
        uncommented: `*
  @file
  @brief <Your brief here>
  <h4> SAS Macros </h4>
*`,
        end: 5
      }
    ]

    it('should add comments', async () => {
      asyncForEach(testTexts, async (text) => {
        const { notCommented, commented, start, end } = text

        await expect(
          addRemoveComment(getMockedActiveEditor(notCommented, start, end))
        ).resolves.toEqual(commented)
      })
    })

    it('should remove comments', async () => {
      asyncForEach(testTexts, async (text) => {
        const { notCommented, commented, uncommented, start, end } = text

        await expect(
          addRemoveComment(getMockedActiveEditor(commented, start, end))
        ).resolves.toEqual(uncommented || notCommented)
      })
    })
  })
})

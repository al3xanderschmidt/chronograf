// Libraries
import _ from 'lodash'

// Constants
import {builder, argTypes} from 'src/flux/constants'

// Types
import {FlatBody, InputArg, Func} from 'src/types/flux'

interface Body extends FlatBody {
  id: string
}

export const changeArg = (
  {key, value, funcID, declarationID = '', bodyID}: InputArg,
  body: Body[]
) => {
  return body.map(b => {
    if (b.id !== bodyID) {
      return b
    }

    if (declarationID) {
      const declarations = b.declarations.map(d => {
        if (d.id !== declarationID) {
          return d
        }

        const functions = editFuncArgs({
          funcs: d.funcs,
          funcID,
          key,
          value,
        })

        return {...d, funcs: functions}
      })

      return {...b, declarations}
    }

    const funcs = editFuncArgs({
      funcs: b.funcs,
      funcID,
      key,
      value,
    })

    return {...b, funcs}
  })
}

export const editFuncArgs = ({funcs, funcID, key, value}): Func[] => {
  return funcs.map(f => {
    if (f.id !== funcID) {
      return f
    }

    const args = f.args.map(a => {
      if (a.key === key) {
        return {...a, value}
      }

      return a
    })

    return {...f, args}
  })
}

export const getBodyToScript = (body: Body[]): string => {
  return body.reduce((acc, b) => {
    if (b.declarations.length) {
      const declaration = _.get(b, 'declarations.0', false)
      if (!declaration) {
        return acc
      }

      if (!declaration.funcs) {
        return `${acc}${b.source}`
      }

      return `${acc}${declaration.name} = ${funcsToScript(
        declaration.funcs
      )}\n\n`
    }

    return `${acc}${funcsToScript(b.funcs)}\n\n`
  }, '')
}

export const funcsToScript = (funcs): string => {
  return funcs
    .map(func => `${func.name}(${argsToScript(func.args)})`)
    .join('\n\t|> ')
}

export const argsToScript = (args): string => {
  const withValues = args.filter(arg => arg.value || arg.value === false)

  return withValues
    .map(({key, value, type}) => {
      if (type === argTypes.STRING) {
        return `${key}: "${value}"`
      }

      if (type === argTypes.ARRAY) {
        return `${key}: ["${value}"]`
      }

      if (type === argTypes.OBJECT) {
        const valueString = _.map(value, (v, k) => k + ':' + v).join(',')
        return `${key}: {${valueString}}`
      }

      return `${key}: ${value}`
    })
    .join(', ')
}

export const appendJoin = (script: string): string => {
  return `${script.trim()}\n\n${builder.NEW_JOIN}\n\n`
}

export const appendFrom = (script: string): string => {
  return `${script.trim()}\n\n${builder.NEW_FROM}\n\n`
}

export const addNode = (
  name: string,
  bodyID: string,
  declarationID: string,
  bodies: Body[]
): string => {
  return bodies.reduce((acc, body) => {
    const {id, source, funcs} = body

    if (id === bodyID) {
      const declaration = body.declarations.find(d => d.id === declarationID)
      if (declaration) {
        return `${acc}${declaration.name} = ${appendFunc(
          declaration.funcs,
          name
        )}`
      }

      return `${acc}${appendFunc(funcs, name)}`
    }

    return `${acc}${formatSource(source)}`
  }, '')
}

export const appendFunc = (funcs: Func[], name: string): string => {
  return `${funcsToScript(funcs)}\n\t|> ${name}()\n\n`
}

export const formatSource = (source: string): string => {
  // currently a bug in the AST which does not add newlines to literal variable assignment bodies
  if (!source.match(/\n\n/)) {
    return `${source}\n\n`
  }

  return `${source}`
}

// formats the last line of a body string to include two new lines
export const formatLastSource = (source: string, isLast: boolean): string => {
  if (isLast) {
    return `${source}`
  }

  // currently a bug in the AST which does not add newlines to literal variable assignment bodies
  if (!source.match(/\n\n/)) {
    return `${source}\n\n`
  }

  return `${source}\n\n`
}

import _ts from 'typescript'

// @ts-marco
type Add<T extends (string | number | bigint)[]> = T[0]
// @ts-marco
function Add(ts: typeof _ts, callerName: string, a: _ts.TypeNode): _ts.Node {
    if (!ts.isTupleTypeNode(a))
        throw new Error('This marco only accept a Tuple as it first arg')
    const x = Array.from(a.elementTypes) as _ts.LiteralTypeNode[]
    if (!x.every(ts.isLiteralTypeNode))
        throw new Error('All member must be literal type')
    const y = x.map(a => {
        let _a: string | number | bigint | undefined = undefined
        if (ts.isBigIntLiteral(a.literal))
            _a = BigInt(a.literal.text.slice(undefined, -1))
        if (ts.isStringLiteral(a.literal)) _a = a.literal.text
        if (ts.isNumericLiteral(a.literal)) _a = Number(a.literal.text)
        return _a
    })
    if (y.some(i => i === void 0))
        throw new Error("Don't know how to apply 'Add' on this type.")
    const r = y.reduce((p, c) => {
        if (typeof p === typeof c) return (p as any) + c
        if (typeof p === 'string' || typeof c === 'string')
            return String(p) + String(c)
        return Number(p) + Number(c)
    })!
    return ts.createTypeAliasDeclaration(
        [],
        [],
        callerName + '_generated',
        undefined,
        ts.createLiteralTypeNode(
            typeof r === 'bigint'
                ? ts.createBigIntLiteral(String(r))
                : typeof r === 'number'
                ? ts.createNumericLiteral(String(r))
                : ts.createStringLiteral(r)
        )
    )
}

type _a = Add<['a', 'b']>
//#region @ts-marco generated _a
type _a_generated = 'ab'
//#endregion

type _ab = Add<['hello ', 'world', 123n]>
//#region @ts-marco generated _ab
type _ab_generated = 'hello world123'
//#endregion

import * as ts from 'ts-morph'
import prettier from 'prettier'
import chokidar, { watch } from 'chokidar'

const watcher = chokidar.watch('*.ts', {
    awaitWriteFinish: true
})
function build(path: string = 'start') {
    console.log(`Rebuilding... Invoked by: ${path}`)
    main().catch(e => {
        throw e
    })
}
watcher.on('add', build)
watcher.on('change', build)
build()

async function main() {
    const p = new ts.Project({ tsConfigFilePath: './tsconfig.json' })
    const configPath = await prettier.resolveConfigFile()
    const prettierConfig = configPath
        ? await prettier.resolveConfig(configPath)
        : {}
    for (const e of p.getSourceFiles()) {
        const veryOrig = e.getFullText()
        e.replaceWithText(
            e
                .getFullText()
                .replace(
                    /\/\/#region @ts-marco generated (.+?)\/\/#endregion/gms,
                    ''
                )
        )
        if (e.isFromExternalLibrary()) continue
        if (!e.getText(true).includes('// @ts-marco')) continue
        const marcos = e
            .getLocals()
            .map(i => {
                const dec = i.getDeclarations()
                if (dec.length !== 2) return false
                dec.sort(x =>
                    ts.TypeGuards.isTypeAliasDeclaration(x) ? 1 : -1
                )
                const [marcoFn, marcoType] = dec as [
                    ts.FunctionDeclaration,
                    ts.TypeAliasDeclaration
                ]
                if (!ts.TypeGuards.isFunctionDeclaration(marcoFn)) return false
                if (!ts.TypeGuards.isTypeAliasDeclaration(marcoType))
                    return false
                if (!hasTSMarco(marcoFn, e)) return false
                if (!hasTSMarco(marcoType, e)) return false
                return [marcoFn, marcoType]
            })
            .filter(i => i) as [
            ts.FunctionDeclaration,
            ts.TypeAliasDeclaration
        ][]
        if (!marcos.length) continue

        for (const [marcoFn, marcoType] of marcos) {
            const marcoFnAlive: (
                _ts: typeof ts['ts'],
                callerName: string,
                ...args: ts.ts.TypeNode[]
            ) => ts.ts.Node = eval(
                '(' +
                    ts.ts.transpile(marcoFn.getText(), {
                        target: ts.ts.ScriptTarget.ES2017
                    }) +
                    ')'
            )
            const nameNode = marcoType.getNameNode()
            const x = p.getLanguageService().findReferences(nameNode)
            const marcoReferences = x
                .flatMap(x => x.getReferences())
                .map((x):
                    | [ts.TypeAliasDeclaration, ts.TypeNode[]]
                    | undefined => {
                    const node = x.getNode()
                    const callerNode = recursiveGetParentKind<
                        ts.TypeAliasDeclaration
                    >(node, ts.ts.SyntaxKind.TypeAliasDeclaration)
                    if (!callerNode) return
                    if (callerNode === marcoType) return undefined
                    const rightExpr = callerNode.getTypeNode()
                    if (!rightExpr) return
                    if (!ts.TypeGuards.isTypeReferenceNode(rightExpr)) {
                        console.log(
                            'A usage that marco is not get called as a type reference',
                            rightExpr.getText()
                        )
                        return undefined
                    } else {
                        return [callerNode, rightExpr.getTypeArguments()]
                    }
                })
                .filter(x => x) as [ts.TypeAliasDeclaration, ts.TypeNode[]][]
            for (const [ref, args] of marcoReferences) {
                ref.replaceWithText(f => {
                    let marcoResult = '// Marco error'
                    try {
                        marcoResult = ts.printNode(
                            marcoFnAlive(
                                ts.ts,
                                ref.getName(),
                                ...args.map(x => x.compilerNode)
                            )
                        )
                    } catch (e) {
                        marcoResult = '// Marco error: ' + e.message
                    }
                    f.write(
                        ref.getText() +
                            `
//${'#'}region @ts-marco generated ${ref.getName()}
${marcoResult}
//#endregion
`
                    )
                })
            }
        }
        e.replaceWithText(
            prettier.format(e.getFullText(), {
                ...prettierConfig,
                parser: 'typescript'
            })
        )
        if (e.getFullText() === veryOrig) continue
        watcher.unwatch(e.getFilePath())
        e.saveSync()
        watcher.add(e.getFilePath())
    }
}

function hasTSMarco(node: ts.Node, sf: ts.SourceFile) {
    const start = node.getStart()
    const triviaStart = start - node.getLeadingTriviaWidth()
    const trivia = sf.getFullText().slice(triviaStart, start)
    if (!trivia.includes('// @ts-marco')) return false
    return true
}

function recursiveGetParentKind<Kind>(
    t: ts.Node | undefined,
    kind: ts.ts.SyntaxKind
): Kind | undefined {
    while (t !== undefined) {
        if (t.compilerNode.kind === kind) return t as any
        t = t.getParent()
    }
    return undefined
}

import { parse } from 'https://deno.land/std/flags/mod.ts'
import { dirname, join, extname, resolve } from 'https://deno.land/std/path/mod.ts'

const { c: configPath, o: outPath } = parse(Deno.args, {
    alias: {
        c: ['config', 'configuration'],
        o: ['out', 'outPath']
    }
})

if (configPath == undefined) {
    console.error('Required parameter c|config|configuration is missing. It should point to the csconfig file.');
    Deno.exit(1)
}

if (outPath == undefined) {
    console.error('Required parameter o|out|outPath is missing. It should point to the folder with .token files.');
    Deno.exit(1)
}

type ParsedConfigFile = { config: Record<string, string>, base?: string }
const parseConfigFile = async (path: string): Promise<ParsedConfigFile> => {
    const content = await Deno.readTextFile(resolve(path))
    const base = /^#base (?<basePath>.*)$/miu.exec(content)?.groups?.basePath?.replace('.\\', '')

    const config: Record<string, string> = {}
    const fields = content.matchAll(/(?<key>[\w_]+)\s*?\{\s*?get.*?"(?<value>.+?)"/giu)
    for await (const field of fields) {
        const { key, value } = field.groups as { key: string, value: string }
        config[key] = value.replaceAll('$', '$$$') // $ is a special character in JS replacement strings
    }

    return { config, base }
}

const configurations: ParsedConfigFile[] = []
configurations.unshift(await parseConfigFile(configPath))

while (configurations[0].base != undefined)
    configurations.unshift(await parseConfigFile(resolve(join(dirname(configPath), `${configurations[0].base}.csconfig`))))

const mergedConfiguration = configurations.reduce((acc, config) => Object.assign(acc, config.config), {} as Record<string, string>)

type ReadTokenFile = { name: string, content: string }
const tokenFiles: ReadTokenFile[] = []
for await (const tokenFile of Deno.readDir(outPath))
    if (tokenFile.isFile && extname(tokenFile.name) === '.token')
        tokenFiles.push({ name: tokenFile.name, content: await Deno.readTextFile(resolve(join(outPath, tokenFile.name))) })

const resultingConfigFiles = tokenFiles.map(tokenFile => ({
    name: tokenFile.name,
    content: Object.entries(mergedConfiguration).reduce((res, [key, value]) =>
        res.replaceAll('${' + key + '}', value),
        tokenFile.content
    )
}))

for (const configFile of resultingConfigFiles)
    await Deno.writeTextFile(resolve(join(outPath, configFile.name.replace('.token', ''))), configFile.content)

console.log('OK')

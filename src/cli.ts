import { Command } from 'commander'
import { registerInit } from './commands/init'
import { registerPing } from './commands/ping'
import { VERSION } from './lib/constants'

const program = new Command()

program
  .name('ellipsis')
  .description('Ellipsis installer CLI: deploy the Ellipsis platform into your own AWS account')
  .version(VERSION)

registerInit(program)
registerPing(program)

program.parseAsync(process.argv)

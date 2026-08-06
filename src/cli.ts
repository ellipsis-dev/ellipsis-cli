import { Command } from 'commander'
import { registerPing } from './commands/ping'
import { VERSION } from './lib/constants'

const program = new Command()

program
  .name('ellipsis')
  .description('Ellipsis installer CLI: deploy the Ellipsis platform into your own AWS account')
  .version(VERSION)

registerPing(program)

program.parseAsync(process.argv)

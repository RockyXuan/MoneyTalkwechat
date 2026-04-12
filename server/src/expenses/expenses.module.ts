import { Module } from '@nestjs/common'
import { ExpensesController } from './expenses.controller'
import { ExpensesService } from './expenses.service'
import { PreferencesController } from './preferences.controller'
import { PreferencesService } from './preferences.service'

@Module({
  controllers: [ExpensesController, PreferencesController],
  providers: [ExpensesService, PreferencesService],
  exports: [ExpensesService, PreferencesService],
})
export class ExpensesModule {}

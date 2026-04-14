import { Module } from '@nestjs/common'
import { ExpensesController } from './expenses.controller'
import { ExpensesService } from './expenses.service'
import { PreferencesController } from './preferences.controller'
import { PreferencesService } from './preferences.service'
import { CategoriesController } from './categories.controller'
import { CategoriesService } from './categories.service'

@Module({
  controllers: [ExpensesController, PreferencesController, CategoriesController],
  providers: [ExpensesService, PreferencesService, CategoriesService],
  exports: [ExpensesService, PreferencesService, CategoriesService],
})
export class ExpensesModule {}

import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ExpensesModule } from './expenses/expenses.module'
import { AiModule } from './ai/ai.module'
import { AsrModule } from './asr/asr.module'
import { SubscriptionsModule } from './subscriptions/subscriptions.module'

@Module({
  imports: [ExpensesModule, AiModule, AsrModule, SubscriptionsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

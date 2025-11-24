import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout.component';
import { AppComponent } from './app.component';

export const appRoutes: Routes = [
    {
        path: '',
        component: LayoutComponent,
        data: {
            layout: 'empty',
            scheme: 'dark'
        },
        children: [
            { path: '', redirectTo: 'example', pathMatch: 'full' },
            { path: 'example', component: AppComponent },
        ]
    }
];

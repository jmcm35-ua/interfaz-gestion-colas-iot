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
            { path: '', component: AppComponent, pathMatch: 'full' },
        ]
    },
    { path: '**', redirectTo: '', pathMatch: 'full' }
];

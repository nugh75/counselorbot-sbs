'use client';

import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { TeacherDevicesPanel } from '@/components/teacher/TeacherDevicesPanel';

export default function TeacherDevicesPage() {
    return (
        <TeacherAreaPage slug="dispositivi">
            {() => <TeacherDevicesPanel />}
        </TeacherAreaPage>
    );
}

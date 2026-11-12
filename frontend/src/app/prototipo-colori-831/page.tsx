import { Suspense } from "react";
import { Prototype } from "./Prototype";

// THROWAWAY PROTOTYPE for wayfinder ticket #831 (map #828). Never merged.
// Question: which surfaces carry the teacher (cream), student (petrol) and
// test-student (celestino) tint? Three variants on one route, ?variant=A|B|C.
export default function Page() {
    return (
        <Suspense>
            <Prototype />
        </Suspense>
    );
}

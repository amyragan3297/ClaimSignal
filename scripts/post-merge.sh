#!/bin/bash
set -e
npm install
npm run db:push
bash server/run-tests.sh
npx tsc --noEmit

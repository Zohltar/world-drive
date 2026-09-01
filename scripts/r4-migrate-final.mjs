import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root=process.cwd();
const workflowPath=path.join(root,'.github','workflows','qa-source-tree-r4-vehicles-audit.yml');
const finalWorkflow=fs.readFileSync(workflowPath,'utf8');

const insertedSteps=`      - name: Vehicle placement refactor QA
        run: node qa/V21_26_VEHICLE_PLACEMENT_REFACTOR_QA.mjs
      - name: Route placement finite QA
        run: node qa/V21_31_ROUTE_PLACEMENT_FINITE_QA.mjs
      - name: WRX night-tail lighting QA
        run: node qa-wrx-night-tail-r1.mjs
      - name: Sonata night-body lighting QA
        run: node qa-sonata-night-body-r1.mjs
      - name: Anti-roll presentation QA
        run: node qa/V21_30_ANTI_ROLL_VISUAL_QA.mjs
      - name: Crest/jump presentation QA
        run: node qa-grip-jump-r6.mjs
`;

const finalBranchBlock=`      - audit/source-tree-r4-vehicles
      - cleanup/source-tree-r4-vehicles
`;
const auditOnlyBranch=`      - audit/source-tree-r4-vehicles
`;

if(!finalWorkflow.includes(finalBranchBlock)){
  throw new Error('R4 final workflow branch contract missing');
}
if(!finalWorkflow.includes(insertedSteps)){
  throw new Error('R4 final workflow focused QA block missing');
}

const preMoveWorkflow=finalWorkflow
  .replace(finalBranchBlock,auditOnlyBranch)
  .replace(insertedSteps,'');

fs.writeFileSync(workflowPath,preMoveWorkflow);

try{
  const migrationUrl=pathToFileURL(path.join(root,'scripts','r4-migrate-once.mjs'));
  migrationUrl.searchParams.set('run',String(Date.now()));
  await import(migrationUrl.href);

  const migratedWorkflow=fs.readFileSync(workflowPath,'utf8');
  if(migratedWorkflow!==finalWorkflow){
    throw new Error('R4 migration did not restore the pre-migrated workflow exactly');
  }

  console.log('R4 FINAL MIGRATION RUNNER: PASS');
}catch(error){
  fs.writeFileSync(workflowPath,finalWorkflow);
  throw error;
}

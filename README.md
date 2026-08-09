# IPEXCO Front-End

## PlanPilot integration

This version of IPEXCO integrates PlanPilot as a planning service. It provides
two project views: Facet Navigation for selecting planning facets and a Graph
view for exploring plans, alternatives and dependencies.

### Run the demo from a fresh clone

The demo requires Docker with the Docker Compose plugin, Git, Bash, `curl` and
Node.js 22. On Windows, run the commands in WSL while Docker Desktop is
running.

```bash
mkdir planpilot-workspace
cd planpilot-workspace

git clone --branch dev https://github.com/VictorMerk/IPEXCO-frontend.git
git clone --branch dev --recurse-submodules https://github.com/VictorMerk/IPEXCO-backend.git
git clone --branch master https://github.com/VictorMerk/planpilot-service.git

cd IPEXCO-frontend
./start-ipexco.sh --demo
```

The command builds and starts all required services. It also creates a demo
user, registers the services and prepares the PlanPilot Towers project. At the
end it prints direct links to both PlanPilot views.

```text
Username: planpilot-demo
Password: planpilot-demo
```

Open `http://localhost:4200`, log in and select the **PlanPilot Towers**
project. Opening PlanPilot shows Facet Navigation. The **Open graph** button
leads to the Graph view. For the graph demo, use bounded encoding and horizon
10.

Stop the stack from the same directory with `./stop-ipexco.sh`.

More information:

- [Demo guide](docs/planpilot-demo.md)
- [Architecture and session lifecycle](docs/planpilot-integration.md)
- [Project contributions](PLANPILOT_CONTRIBUTIONS.md)
- [Docker Compose reference](setup/planpilot-local/README.md)

## Front-end development

### Dependencies

The dependencies are:

- `npm` (https://www.npmjs.com/)
- `node.js` version 22 (https://nodejs.org/en)
- *Angular CLI* version 19 (https://angular.dev/tools/cli/setup-local)


Before the first run, install the locked npm dependencies with:

```
npm ci
```

### Run

To run the development server on the default port (`4200`) run:

```
npm start
```
If you want to use a different port run

```
ng serve --port <port>
```

### Back-End Setup

To run the back-end server natively we refer to the 
[README](https://github.com/VictorMerk/IPEXCO-backend) of the back-end repository.

To set up the back-end server and the pre-built Docker images see
[Docker](setup/README.md).

## Existing IPEXCO platform usage

### Register

When you open IPEXCO for the first time click on *Register*. 
Select a username and password. Make sure to save it. There is no option 
to reset your password.

### Iterative Planning for PDDL Domain

To start the iterative planning process for a classical planning problem, 
perform the following steps:

**Create a domain specification**

1. Go to the Menu in the top left corner and then to Specifications.
1. Add a domain specification for your planning problem. Give it a name and 
select as encoding `PDDL_CLASSIC`.
1. Edit the domain (*pencil* icon) to define goal templates. They are necessary 
to define goals during the iterative planning process. In the file 
`setup/example_data/blocksworld/templates.json` you can find some examples for 
the blocksworld domain. In [Section](#goal-templates) you find detailed 
instructions on how to define goal templates.
1. Don't forget to **save**.


**Register all required services**

How to obtain and run the docker images of the services is described in the 
[README](https://github.com/VictorMerk/IPEXCO-backend) of the back-end repository.

The following `localhost` URLs apply when the back-end runs directly on the
host. When using the PlanPilot Compose setup, use the service names from its
[registration table](setup/planpilot-local/README.md#register-services-in-ipexco).

1. Add a classical PDDL planner (e.g. [FD Planning Service](https://github.com/r-eifler/planner-service)) as a service. As type select `PLANNER` as 
URL `http://localhost:3333` (If you have not changed any of the default settings),
and as API Key what you defined in the *env* file of the planner docker container, 
as encoding `PDDL_CLASSIC`.
1. Add the classical property checker [Service](https://github.com/r-eifler/property_checker_service) as a service. As type select `PROPERTY_CHECKER` as 
URL `http://localhost:3335` (If you have not changed any of the default settings),
and as API Key what you defined in the *env* file of the property checker docker 
container, as encoding `PDDL_CLASSIC`.
1. Add the classical explainer [Service](https://github.com/r-eifler/explainer-service) 
as a service. As type select `EXPLAINER` as 
URL `http://localhost:3334` (If you have not changed any of the default settings),
and as API Key what you defined in the *env* file of the explainer docker 
container, as encoding `PDDL_CLASSIC`.

**Create a Project**

1. Now go back to the main menu (top left corner) and select Projects.
1. Create a new project and select as domain the one you just created.
In the next step you can upload the PDDL domain and problem file.
The parser might take a few seconds, but the form will indicate once the 
problem definition has been successfully processed. Then you can create the 
project.
1. Click on the right arrow of the new created project.
1. Go to Settings.
1. Select the Planner, Explainer and Property Checker you just registered.
1. As interfaces select *Templates* for both property creation and explanations.
1. Save the settings.
1. Go back to the main overview of the project (*house* icon in the top).


**Iterative Planning**

1. Start the iterative planning process.
1. To create your first iteration step, click on the card stating 
*Perform a new plan computation from scratch*. A side panel on the right opens.
1. Define your first property. Click on *Add Property* in the section for 
*Enforced Goals* and then in the dialog on *Create New Property*.
A new dialog to create properties opens.
(**Note**: If there are no options in the dialog, this means something is wrong 
with the goal templates you defined in the domain specification.)
1. Select a property class and then a property.
1. Instantiate a property by selecting all required objects. 
1. (optionally) In the third step you can change the name, description and 
utility of the property if you want.
1. Click *Create*.
1. Select the just created property and then click *Select*.
1. Finish the creation of the iteration by clicking *Create* in the bottom 
right corner of the side panel.
1. You are automatically redirected to the details' page of the new created 
iteration step.


You find more instructions about the interface and an introduction to the 
explanation interface in the platform's manual. To access it click on the 
question mark in the top right corner.

### Demos

A demo is an iterative planning task with a **fixed** set of properties.
This allows to precompute all MUGS/MCGS, resulting in an almost instant response 
to a user question. 
Additionally, it gives a fair evaluation environment for user studies, since 
every participant processes the same optimization task.

To compute a demo perform the following steps. 

1. Go to the main menu of the project, and then to the **Demos** feature.
1. Click on *Create a new demo based on the current project*.
1. Define a name.
1. Domain and instance description are shown during a user study to explain the 
domain and the concrete instance to the user.
1. The optional image is also used to facilitate the understanding of the domain 
to the user during a user study.
1. The last step is to select the goals/properties. You can choose from the 
properties defined during the iterative planning in the domain and create new 
properties. Make sure to rename them if necessary and that you assign the correct
utility value.
1. Click *save* to create the demo and start the pre-computation of all MUGS/MCGS.
This can take some time.

Once the computation of a demo finished you can click on *Details* to access 
an overview of all MUGS/MCGS and the settings of the demo. 

**Share Demos** In the top right corner of the demos details view, you can download
the demo as a JSON file. This allows you to share demos between instances of 
IPEXCO. To upload the demo go to the main demos menu in the left navigation panel 
and click *Upload Demo*. Uploaded demos as not associated with a project and 
are only accessible via the main demos menu.


### Goal Templates

Goal template define mappings from a natural language definition of a goal/property
to an LTL formula. Using such templates facilitates the definition of properties 
as the user only needs to select objects to instantiate a goal instead of 
writing a low level formal definition.

A goal templates are defined in JSON. Below you can find an example for a 
goal template for the blocksworld domain:

```
	{
		"class": "Block Position",
		"color": "#ed736b",
		"icon": "arrow_downward",
		"type": "G",
		"variables": {
			"$B1": ["block"],
			"$B2": ["block"]
		},
		"nameTemplate": "$B1 on $B2",
		"definitionTemplate": {
			"name": "on",
			"parameters": ["$B1","$B2"]
		},
		"formulaTemplate": "on($B1,$B2)",
		"actionSetsTemplates": [],
		"sentenceTemplate": "Block $B1 is on block $B2 .",
		"initVariableConstraints": [],
		"goalVariableConstraints": []
	},
```
- `class`: Is a string used to group the templates in the interface.
- `color`: Color to group and identify properties. Currently used for the background 
    color of the property icons.
- `icon`: Icon used to identify properties. Supported icons: [Material Icons](https://fonts.google.com/icons).
- `type`: Supported types `G`, `LTL`
    - `G`: simple PDDL goal fact, must be satisfied in the last state of the plan. 
        `formulaTemplate` must be single fact.
    - `LTL`: finite LTL property. `formulaTemplate` must be an LTLf formula over 
        facts or action set variables. 
- `variables`: map from variable name to list of allow types. Variable names 
    must start with **$**.
- `nameTemplate`: template for the name of the property. This name is used to 
    reference the goal in the interface. It should be short but pertinent and unique.
- `definitionTemplate`: for domain dependent planners/explainers the *definition* field
    can be used as a more abstract option of defining a property. 
    It consists of a name and a list of parameters. 
- `formulaTemplate` template for the formal definition of the goal/property
    - `G`: fact of the PDDL planning task
    - `LTL`: LTLf formula over PDDL facts or action set variables 
        **Attention**: must be in prefix notation
- `actionSetsTemplates`: A set of action set templates which can be used to 
    define LTL formulas over sets of actions. For the definition of an action
    template see [Action Set Template](#action-set-template).
-  `sentenceTemplate`: The sentence template is used to generate a more detailed 
    description of the property. 
- `initVariableConstraints`: a list of facts that must be satisfied in the initial
    state of the PDDL task for a valid instantiation of the template. 
- `goalVariableConstraints`: a list of facts that must be satisfied in the original 
    goal specification of the PDDL task for a valid instantiation of the template.

##### Action Set Template

An action set template consist of a name and a list of action templates: 

```
{
    name: string
    actionTemplates: string[]
}
```

An action template is a string of the form: 

```
action_name parameters_0 parameters_1 ... parameters_n
```

where `parameter_i` can be

- a variable define din `variables`
- an object from the PDDL planning task
- `*` (wildcard) which means that any object matches


The name can be used as variable in the definition of LTLf properties. 
The variable is `true` is a state `s` if one of the actions in the actions set 
was applied to reach state `s`.

### LLM Prompts

To use one of the LLM interface, at least one of "Property Creation Interface
Explanation Interface" or "Question Interface" should be set to "LLM Chat" in the project 
settings.

In these settings there are several parameters that can be set.
- Model (e.g. gpt-4o)
- Temperature (e.g. 0.0)
- Maximal number of completion tokens (e.g. 1000)
- Enable Goal Translator (to be automatically used in the iterative planning process when asking about unknown goals)
- Show Reverse Translation (of how the question translator understood the user's question)

The prompts used are also modular :

- System Prompt (prepended to all prompts)
- Goal Translator Instructions Prompt
- Question Classifier Instructions Prompt
- Explanation Translator Instructions Prompt

The output schema of LLMs can also be selected : 
For more information on structured outputs, see [OpenAI's guide on structured outputs](https://platform.openai.com/docs/guides/structured-outputs).

- Goal Translator Output Schema
- Question Classifier Output Schema
- Explanation Translator Output Schema

These can be selected from the prompts defined in the "Specification" page.

Examples prompts and output schemas for the Parents Afternoon domain are given in [setup/example_data/parentsafternoon/](setup/example_data/parentsafternoon/).

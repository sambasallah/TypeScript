/* @internal */
namespace ts.codefix {
    const fixId = "addMissingConst";
    const errorCodes = [
        Diagnostics.Cannot_find_name_0.code,
        Diagnostics.No_value_exists_in_scope_for_the_shorthand_property_0_Either_declare_one_or_provide_an_initializer.code
    ];

    registerCodeFix({
        errorCodes,
        getCodeActions: (context) => {
            const changes = textChanges.ChangeTracker.with(context, t => makeChange(t, context.sourceFile, context.span.start, context.program));
            if (changes.length > 0) {
                return [createCodeFixAction(fixId, changes, Diagnostics.Add_const_to_unresolved_variable, fixId, Diagnostics.Add_const_to_all_unresolved_variables)];
            }
        },
        fixIds: [fixId],
        getAllCodeActions: context => {
            const fixedNodes = new NodeSet();
            return codeFixAll(context, errorCodes, (changes, diag) => makeChange(changes, diag.file, diag.start, context.program, fixedNodes));
        },
    });

    function makeChange(changeTracker: textChanges.ChangeTracker, sourceFile: SourceFile, pos: number, program: Program, fixedNodes?: NodeSet<Node>) {
        const token = getTokenAtPosition(sourceFile, pos);
        const forInitializer = findAncestor(token, node =>
            isForInOrOfStatement(node.parent) ? node.parent.initializer === node :
            isPossiblyPartOfDestructuring(node) ? false : "quit"
        );
        if (forInitializer) return applyChange(changeTracker, forInitializer, sourceFile, fixedNodes);

        const parent = token.parent;
        if (isBinaryExpression(parent) && isExpressionStatement(parent.parent)) {
            return applyChange(changeTracker, token, sourceFile, fixedNodes);
        }

        if (isArrayLiteralExpression(parent)) {
            const checker = program.getTypeChecker();
            if (!every(parent.elements, element => arrayElementCouldBeVariableDeclaration(element, checker))) {
                return;
            }

            return applyChange(changeTracker, parent, sourceFile, fixedNodes);
        }
    }

    function applyChange(changeTracker: textChanges.ChangeTracker, initializer: Node, sourceFile: SourceFile, fixedNodes?: NodeSet<Node>) {
        if (!fixedNodes || fixedNodes.tryAdd(initializer)) {
            changeTracker.insertModifierBefore(sourceFile, SyntaxKind.ConstKeyword, initializer);
        }
    }

    function isPossiblyPartOfDestructuring(node: Node): boolean {
        switch (node.kind) {
            case SyntaxKind.Identifier:
            case SyntaxKind.ArrayLiteralExpression:
            case SyntaxKind.ObjectLiteralExpression:
            case SyntaxKind.PropertyAssignment:
            case SyntaxKind.ShorthandPropertyAssignment:
                return true;
            default:
                return false;
        }
    }

    function arrayElementCouldBeVariableDeclaration(expression: Expression, checker: TypeChecker) {
        const identifier =
            isIdentifier(expression) ? expression :
            isAssignmentExpression(expression, /*excludeCompoundAssignment*/ true) && isIdentifier(expression.left) ? expression.left :
            undefined;
        return !!identifier && !checker.getSymbolAtLocation(identifier);
    }
}

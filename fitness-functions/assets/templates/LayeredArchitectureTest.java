// ArchUnit — modularity fitness functions for Java/Kotlin, run as ordinary
// unit tests (so they execute in the existing `mvn test` / `gradle test` CI).
// Installed by the `fitness-functions` skill.
// Docs: https://www.archunit.org
//
// Replace `com.example` with this repo's base package (detected in Phase 1)
// and adjust layer package names to match the real structure.

package com.example.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.library.Architectures;
import com.tngtech.archunit.library.dependencies.SlicesRuleDefinition;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

class LayeredArchitectureTest {

    private final JavaClasses classes = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.example");

    /** No cyclic dependencies between packages — the headline fitness function. */
    @Test
    void noPackageCycles() {
        SlicesRuleDefinition.slices()
                .matching("com.example.(*)..")
                .should().beFreeOfCycles()
                .check(classes);
    }

    /** Enforce the intended layer access direction. */
    @Test
    void layeredArchitectureIsRespected() {
        Architectures.layeredArchitecture().consideringAllDependencies()
                .layer("Controller").definedBy("com.example.controller..")
                .layer("Service").definedBy("com.example.service..")
                .layer("Repository").definedBy("com.example.repository..")
                .whereLayer("Controller").mayNotBeAccessedByAnyLayer()
                .whereLayer("Service").mayOnlyBeAccessedByLayers("Controller")
                .whereLayer("Repository").mayOnlyBeAccessedByLayers("Service")
                .check(classes);
    }

    /** Domain must stay free of framework/persistence concerns. */
    @Test
    void domainStaysPure() {
        noClasses().that().resideInAPackage("com.example.domain..")
                .should().dependOnClassesThat()
                .resideInAnyPackage("..jakarta.persistence..", "org.springframework..")
                .check(classes);
    }
}

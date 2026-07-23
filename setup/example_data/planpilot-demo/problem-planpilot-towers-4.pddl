(define (problem planpilot-towers-4)
  (:domain planpilot-towers)

  (:objects
    a b c d - block
  )

  (:init
    (on a b)
    (on b c)
    (ontable c)
    (ontable d)
    (clear a)
    (clear d)
    (handempty)
  )

  (:goal
    (and
      (on d c)
      (on c b)
      (on b a)
      (ontable a)
    )
  )
)
